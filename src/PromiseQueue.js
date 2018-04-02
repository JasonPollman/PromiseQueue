/**
 * A highly flexible queue that runs `maxConcurrency` methods at a time
 * and waits for each method to resolve before calling the next.
 *
 * Support for queue pausing, prioritization, reduction and both FIFO and LIFO modes.
 * Works in both browsers and node.js.
 *
 * Requirements: Promise support/polyfill
 * @author Jason Pollman <jasonjpollman@gmail.com>
 * @since 3/15/18
 * @file
 */

/**
 * Assigned to every promise returned from PromiseQueue#enqueue
 * to ensure the user isn't returning another qneueued promise.
 * @type {string}
 */
const IS_PROMISE_QUEUE_PROMISE = '__IS_PROMISE_QUEUE_PROMISE__';

/**
 * The properties picked from each enqueued item when
 * passed to user methods (for encapsulation and to prevent mutation).
 * @type {Array<string>}
 */
const PICK_FROM_ENQUEUED = ['args', 'method', 'priority', 'context'];

/**
 * Native prototype properties.
 * This is the set of prototypes which we don't want to queueify when running
 * `queueifyAll` on an object and walking it's prototype chain.
 * @type {Array<object>}
 */
const NATIVES_PROTOTYPES = [
  Object.getPrototypeOf(Object),
  Object.getPrototypeOf(Array),
  Object.getPrototypeOf(String),
  Object.getPrototypeOf(Number),
  Object.getPrototypeOf(Boolean),
  Object.getPrototypeOf(Function),
];

/**
 * The set of native static properties we don't want to queueify.
 * @type {Array<function>}
 */
const NATIVES = [
  Object,
  Array,
  String,
  Number,
  Boolean,
  Function,
];

/**
 * Capitalizes the first character of a string.
 * @param {string} s The string to capitalize.
 * @returns {string} The capitalized string.
 */
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Invokes the given array of functions with the given array of arguments.
 * @param {Array<function>} methods An array of methods to invoke.
 * @param {Array} args The arguments to invoke the method with.
 * @returns {undefined}
 */
const invokeAllWithArguments = (methods, args) => methods.forEach(method => method(...args));

/**
 * Curried version of `invokeAllWithArguments`.
 * @param {Array<function>} methods An array of methods to invoke.
 * @returns {undefined}
 */
const invokerOfAllWithArguments = methods => (...args) => invokeAllWithArguments(methods, args);

/**
 * Returns a function used by Array#sort to sort queues by priority in fifo mode.
 * @param {Array} deprioritized Collects deprioritized enqueued items.
 * @returns {number} A sort result value.
 */
const prioritySortFIFO = deprioritized => (a, b) => {
  const difference = Number(b.priority) - Number(a.priority);
  if (difference > 0 && deprioritized.indexOf(a) === -1) deprioritized.push(a);
  return difference;
};

/**
 * Returns a function used by Array#sort to sort queues by priority in lifo mode.
 * @param {Array} deprioritized Collects deprioritized enqueued items.
 * @returns {number} A sort result value.
 */
const prioritySortLIFO = deprioritized => (a, b) => {
  const difference = Number(a.priority) - Number(b.priority);
  if (difference < 0 && deprioritized.indexOf(a) === -1) deprioritized.push(a);
  return difference;
};

/**
 * Similar to Array#findIndex (which is unsupported by IE).
 * @param {Array} collection The collection to find an index within.
 * @param {function} iteratee The function to invoke for each item.
 * @returns {number} The index of the found item, or -1.
 */
function findIndex(collection, iteratee) {
  let index = -1;

  collection.some((item, key) => {
    if (!iteratee(item, key, collection)) return false;
    index = key;
    return true;
  });

  return index;
}

/**
 * A simplified version lodash's pick.
 * @param {object} source The source object to pick the properties from.
 * @param {Array<string>} properties The properties to pick from the object.
 * @returns {object} A new object containing the specified properties.
 */
function pick(source, properties) {
  const result = {};
  properties.forEach((property) => { result[property] = source[property]; });
  return result;
}

/**
 * Returns the function name for a queueified method (using prefix and suffix).
 * @param {string} methodName The name of the method to get the queueify key of.
 * @param {string} prefix The key prefix.
 * @param {string} suffix The key suffix.
 * @returns {string} The queueified function name of "methodName".
 */
function keyForQueueifiedMethod(methodName, prefix, suffix) {
  return `${prefix}${capitalize(methodName)}${capitalize(suffix)}`;
}

/**
 * The massaged dequeued object returned from PromiseQueue#clear and PromiseQueue#remove.
 * @param {object} dequeued An object dequeued from the queue.
 * @returns {object} The exportable queue object.
 */
function getExportableQueueObject(dequeued) {
  return {
    ...pick(dequeued, PICK_FROM_ENQUEUED),
    resolve: invokerOfAllWithArguments(dequeued.resolvers),
    reject: invokerOfAllWithArguments(dequeued.rejectors),
  };
}

/**
 * Used by Array.prototype.reduce to reduce the queue using the user's
 * `handleQueueReduction` method.
 * @param {function} handleQueueReduction The user's `handleQueueReduction` method.
 * @returns {function} A queue reducer, given a reducer function.
 */
function onQueueItemReduction(handleQueueReduction) {
  return (reducedQueue, current, index, queue) => {
    const previous = queue[index - 1] || null;

    let dropped = false;
    let combined = false;

    // Drops the enqueued method call.
    // Warning: this will cause promises to never resolve. For that
    // reason, this method returns the rejectors and resolvers.
    const drop = () => {
      dropped = true;
      return {
        resolve: invokerOfAllWithArguments(current.resolvers),
        reject: invokerOfAllWithArguments(current.rejectors),
      };
    };

    // Combines the previous and current enqueued methods.
    // This doesn't combine the functionality, but passes
    // all of the resolvers and rejectors to the previous
    // method invocation and drops the current one (effectively
    // "combining" the call into a single one).
    const combine = () => {
      if (!previous) throw new Error('Cannot combine queued method calls without a previous value.');
      combined = true;
    };

    const prev = previous && pick(previous, PICK_FROM_ENQUEUED);
    const curr = pick(current, PICK_FROM_ENQUEUED);
    handleQueueReduction(prev, curr, combine, drop);

    if (combined && dropped) {
      throw new Error('Cannot both combine and drop an enqueued method call.');
    }

    // If the calls were "combined", pass the resolvers and rejectors
    // of the current method to the previous one. If it wasn't dropped
    // keep the current method in the queue.
    if (combined) {
      previous.resolvers.push(...current.resolvers);
      previous.rejectors.push(...current.rejectors);
    } else if (!dropped) {
      reducedQueue.push(current);
    }

    return reducedQueue;
  };
}

/**
 * Iterates an object's own and inherited functions and walks the prototype chain until
 * Object.prototype is reached. This will be used to queueify inherited functions below.
 * @param {object} object The object to call `iteratee` on for each own and inherited property.
 * @param {function} iteratee The callback to invoke for each property.
 * @param {object} handled Keeps track of properties that have already been queueified
 * lower down in the prototype chain to prevent overwriting previous queueifications.
 * @returns {undefined}
 */
function forEachOwnAndInheritedFunction(object, iteratee, handled = {}) {
  // Don't promisify native prototype properties.
  if (!object || NATIVES_PROTOTYPES.indexOf(object) > -1) return;
  const visited = handled;

  // Iterate the object's own properties
  Object.getOwnPropertyNames(object).forEach((property) => {
    if (visited[property]) return;
    visited[property] = true;

    const value = object[property];
    if (typeof value !== 'function' || property === 'constructor') return;
    iteratee(value, property);
  });

  // Iterate the object's constructor properties (static properties)
  if (NATIVES.indexOf(object.constructor) === -1) {
    Object.getOwnPropertyNames(object.constructor).forEach((property) => {
      if (visited[property]) return;
      visited[property] = true;

      const value = object.constructor[property];
      if (typeof value !== 'function' || property === 'prototype') return;
      iteratee(value, property);
    });
  }

  forEachOwnAndInheritedFunction(Object.getPrototypeOf(object), iteratee, visited);
}

/**
 * A queue that runs only `maxConcurrency` functions at a time, that
 * can also operate as a stack. Items in the queue are dequeued once
 * previous functions have fully resolved.
 * @class PromiseQueue
 */
module.exports = class PromiseQueue {
  /**
   * Works like Bluebird's Promise.promisify.
   * Given a function, this will return a wrapper function that enqueue's a call
   * to the function using either the provided PromiseQueue isntance or a new one.
   * @param {function} method The method to queueify.
   * @param {object} options Queueification options.
   * @param {PromiseQueue=} options.queue The queue the wrapper function will operate using.
   * @param {any} options.context The value for `this` in the queueified function.
   * @returns {function} The queueified version of the function.
   * @memberof PromiseQueue
   * @static
   */
  static queueify(method, {
    queue = new PromiseQueue(),
    context = queue,
    priority = 0,
  } = {}) {
    if (typeof method !== 'function') {
      throw new TypeError(
        'You must pass a function for parameter "method" to queueify.',
      );
    }

    if (!(queue instanceof PromiseQueue)) {
      throw new TypeError(
        'PromiseQueue.queueify expected an instance of PromiseQueue for parameter "queue".',
      );
    }

    return (...args) => queue.enqueue(method, { args, context, priority });
  }

  /**
   * Works like Bluebird's Promise.promisifyAll.
   * Given an object, this method will create a new "queued" version of each function
   * on the object and assign it to the object as [prefix][method name][suffix] (camel cased).
   * All calls to the queued version will use PromiseQueue#enqueue.
   * *Note* This will mutate the passed in object.
   * @param {object} object The object to create new queified functions on.
   * @param {object} options Queification options.
   * @param {string=} options.prefix A prefix prepended to queueified function property names.
   * @param {string=} options.suffix A suffix appended to queueified function property names.
   * @param {object} options.priorities A mapping of the *original* function names to
   * queue priorities.
   * @param {PromiseQueue=} options.queue The PromiseQueue instance for each function
   * to operate using.
   * @param {string=} assignQueueAsProperty The property name to assign the PromiseQueue instance
   * on the object as. Set this to a falsy value to omit adding a reference to the queue.
   * @returns {object} The originally passed in object with new queueified functions attached.
   * @memberof PromiseQueue
   * @static
   */
  static queueifyAll(object, {
    prefix = 'queued',
    suffix = '',
    priorities = {},
    queue = new PromiseQueue(),
    assignQueueAsProperty = 'queue',
  } = {}) {
    if (typeof object !== 'object' || !Object.isExtensible(object)) {
      throw new Error('Cannot queueify a non-object or non-extensible object.');
    }

    const target = object;
    const functions = [];

    // Iterate over all of the object's own and inherited functions and queueify each method.
    // This will add a new propery on the object [prefix][method name][suffix].
    forEachOwnAndInheritedFunction(target,
      (value, property) => functions.push({ value, property }),
    );

    functions.forEach(({ value, property }) => {
      target[keyForQueueifiedMethod(property, prefix, suffix)] = PromiseQueue.queueify(value, {
        queue,
        context: target,
        priority: Number(priorities[property]) || 0,
      });
    });

    // Store off a reference to the object's queue for user use.
    // This can be disabled by setting `assignQueueAsProperty` to false.
    if (typeof assignQueueAsProperty === 'string') target[assignQueueAsProperty] = queue;
    return object;
  }

  /**
   * Creates an instance of PromiseQueue.
   * @param {object} options PromiseQueue instance options.
   * @param {boolean=} options.lifo If true, the instance will operate as a stack
   * rather than a queue (using .pop instead of .shift).
   * @param {number} options.maxConcurrency The maximum number of queue methods that can
   * run concurrently. Defaults to 1 and is claped to [1, Infinify].
   */
  constructor({
    lifo = false,
    onQueueDrained,
    onMethodEnqueued,
    maxConcurrency = 1,
    handleQueueReduction,
    onMethodDeprioritized,
  } = {}) {
    this.queue = [];
    this.running = 0;
    this.lifo = Boolean(lifo);

    this.isDrained = false;
    this.isPaused = false;

    this.handleQueueReduction = handleQueueReduction;
    this.onMethodDeprioritized = onMethodDeprioritized;

    this.onQueueDrained = onQueueDrained;
    this.onMethodEnqueued = onMethodEnqueued;
    this.setMaxConcurrency(maxConcurrency);

    // An optimization to prevent sorting the queue on every enqueue
    // until a priority has been set on a method.
    this.prioritySortMode = false;
  }

  /**
   * @returns {number} The number of enqueued items.
   * @memberof PromiseQueue
   * @readonly
   */
  get size() {
    return this.queue.length;
  }

  /**
   * An alias for "enqueue".
   * If in lifo mode this verb might be more correct.
   * @readonly
   */
  get push() {
    return this.enqueue;
  }

  /**
   * Sets the queue's maximum concurrency.
   * @param {number} maxConcurrency The concurrent value to set.
   * @returns {PromiseQueue} The current PromiseQueue instance for chaining.
   * @memberof PromiseQueue
   */
  setMaxConcurrency(maxConcurrency) {
    this.maxConcurrency = Math.max(Number(maxConcurrency) || 1, 1);
    return this;
  }

  /**
   * Called when a task has started processing.
   * @returns {undefined}
   * @memberof PromiseQueue
   */
  onMethodStarted() {
    this.running++;
  }

  /**
   * Called when a task has finished processing. This is called regardless
   * of whether or not the user's queued method succeeds or throws.
   * @param {function} resolvers The running method's resolve/reject functions.
   * @param {any} result The result yielded from the method's invocation.
   * @returns {undefined}
   * @memberof PromiseQueue
   */
  onMethodCompleted(resolvers, result) {
    this.running--;
    invokeAllWithArguments(resolvers, [result]);
    this.tick();
  }

  /**
   * "Ticks" the queue. This will start process the next item in the queue
   * if the queue is idle or hasn't reached the queue's `maxConcurrency`.
   * @returns {undefined}
   * @memberof PromiseQueue
   */
  tick() {
    // Nothing left to process in the queue
    if (!this.queue.length) {
      if (typeof this.onQueueDrained === 'function' && !this.isDrained) this.onQueueDrained();
      this.isDrained = true;
      this.prioritySortMode = false;
      return;
    }

    // Too many running tasks or the queue is paused.
    if (this.running >= this.maxConcurrency || this.isPaused) return;
    this.onMethodStarted();

    // Process the next task in the queue.
    // This will increment the number of "concurrently running methods",
    // run the method, and then decrement the running methods.
    const {
      args,
      method,
      context,
      resolvers,
      rejectors,
    } = this.queue[this.lifo ? 'pop' : 'shift']();

    // We must call the function imediately since we've already
    // deferred invocation once (in `enqueue`). Otherwise, we will
    // get a strange order of execution.
    let returned;

    try {
      returned = method.call(context, ...args);

      if (returned && returned[IS_PROMISE_QUEUE_PROMISE]) {
        throw new Error(
          'Queue out of order execution: cannot resolve with something that ' +
          "won't be called until this function completes.",
        );
      }
    } catch (e) {
      this.onMethodCompleted(rejectors, e);
      return;
    }

    Promise.resolve(returned)
      .catch(e => this.onMethodCompleted(rejectors, e))
      .then(results => this.onMethodCompleted(resolvers, results));
  }

  /**
   * Sorts the queue based on priorities.
   * @returns {undefined}
   * @memberof PromiseQueue
   */
  prioritizeQueue() {
    const deprioritized = [];
    const sorter = this.lifo ? prioritySortLIFO : prioritySortFIFO;
    this.queue.sort(sorter(deprioritized));

    if (typeof this.onMethodDeprioritized === 'function') {
      deprioritized.forEach((enqueued) => {
        const prio = Number(this.onMethodDeprioritized(pick(enqueued, PICK_FROM_ENQUEUED))) || 0;
        // eslint-disable-next-line no-param-reassign
        enqueued.priority = prio;
      });
    }
  }

  /**
   * Calls the `handleQueueReduction` on each item in the queue, allowing users
   * to "combine" similar queued methods into a single call.
   * @returns {undefined}
   * @memberof PromiseQueue
   */
  reduceQueue() {
    if (typeof this.handleQueueReduction !== 'function') return;
    this.queue = this.queue.reduce(onQueueItemReduction(this.handleQueueReduction), []);
  }

  /**
   * Adds a method into the PromiseQueue for deferred execution.
   * @param {function} method The function to enqueue.
   * @param {object} options Method specific enqueueing options.
   * @returns {Promise} Resolves once the passed in method is dequeued and executed to completion.
   * @memberof PromiseQueue
   */
  enqueue(method, options = {}) {
    const enqueuedMethodPromise = new Promise((resolve, reject) => {
      const { args = [], priority = 0, context = this } = options;

      if (typeof method !== 'function') {
        return reject(new TypeError(
          'PromiseQueue#enqueue expected a function for argument "method".',
        ));
      }

      if (!(args instanceof Array)) {
        return reject(new TypeError(
          'PromiseQueue#enqueue expected an array for argument "options.args".',
        ));
      }

      this.queue.push({
        args,
        method,
        context,
        priority: Number(priority) || 0,
        rejectors: [reject],
        resolvers: [resolve],
      });

      this.isDrained = false;

      // Toggles the queue from un-sorted mode to priority sort mode.
      if (Number(priority) !== 0) this.prioritySortMode = true;

      // First prioritize the queue (sort it by priorities),
      // then allow the user the opportunity to reduce it.
      if (this.prioritySortMode) this.prioritizeQueue();
      this.reduceQueue();

      if (typeof this.onMethodEnqueued === 'function') {
        this.onMethodEnqueued(method, options);
      }

      // Defer the execution of the tick until the next iteration of the event loop
      // This is important so we allow all synchronous "enqueues" occur before any
      // enqueued methods are actually invoked.
      Promise.resolve().then(() => this.tick());
      return undefined;
    });

    enqueuedMethodPromise[IS_PROMISE_QUEUE_PROMISE] = true;
    return enqueuedMethodPromise;
  }

  /**
   * @returns {Array<function>} A shallow copy of the queue's enqueued methods.
   * @memberof PromiseQueue
   */
  getEnqueuedMethods() {
    return this.queue.map(({ method }) => method);
  }

  /**
   * Clears all enqueued methods from the queue. Any method that's already
   * been dequeued will still run to completion.
   * @returns {PromiseQueue} The current PromiseQueue instance for chaining.
   * @memberof PromiseQueue
   */
  clear() {
    const values = this.queue.map(getExportableQueueObject);
    this.queue = [];
    return values;
  }

  /**
   * Removes an enqueued method from the queue. If the method to remove
   * has already started processing, it will *not* be removed.
   * @param {function} method The method to remove.
   * @returns {function|null} The removed method if found, `null` otherwise.
   * @memberof PromiseQueue
   */
  remove(method) {
    if (typeof method !== 'function') return null;
    const index = findIndex(this.queue, ({ method: enqueued }) => enqueued === method);
    return index !== -1 ? getExportableQueueObject(this.queue.splice(index, 1)[0]) : null;
  }

  /**
   * Pauses the queue.
   * @returns {PromiseQueue} The current PromiseQueue instance for chaining.
   * @memberof PromiseQueue
   */
  pause() {
    this.isPaused = true;
    return this;
  }

  /**
   * Resumes the queue.
   * @returns {PromiseQueue} The current PromiseQueue instance for chaining.
   * @memberof PromiseQueue
   */
  resume() {
    if (this.isPaused) {
      this.isPaused = false;
      this.tick();
    }

    return this;
  }
};
