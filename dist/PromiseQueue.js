'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

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
var IS_PROMISE_QUEUE_PROMISE = '__IS_PROMISE_QUEUE_PROMISE__';

/**
 * The properties picked from each enqueued item when
 * passed to user methods (for encapsulation and to prevent mutation).
 * @type {Array<string>}
 */
var PICK_FROM_ENQUEUED = ['args', 'method', 'priority', 'context'];

/**
 * Native prototype properties.
 * This is the set of prototypes which we don't want to queueify when running
 * `queueifyAll` on an object and walking it's prototype chain.
 * @type {Array<object>}
 */
var NATIVES_PROTOTYPES = [Object.getPrototypeOf(Object), Object.getPrototypeOf(Array), Object.getPrototypeOf(String), Object.getPrototypeOf(Number), Object.getPrototypeOf(Boolean), Object.getPrototypeOf(Function)];

/**
 * The set of native static properties we don't want to queueify.
 * @type {Array<function>}
 */
var NATIVES = [Object, Array, String, Number, Boolean, Function];

/**
 * Capitalizes the first character of a string.
 * @param {string} s The string to capitalize.
 * @returns {string} The capitalized string.
 */
var capitalize = function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Invokes the given array of functions with the given array of arguments.
 * @param {Array<function>} methods An array of methods to invoke.
 * @param {Array} args The arguments to invoke the method with.
 * @returns {undefined}
 */
var invokeAllWithArguments = function invokeAllWithArguments(methods, args) {
  return methods.forEach(function (method) {
    return method.apply(undefined, _toConsumableArray(args));
  });
};

/**
 * Curried version of `invokeAllWithArguments`.
 * @param {Array<function>} methods An array of methods to invoke.
 * @returns {undefined}
 */
var invokerOfAllWithArguments = function invokerOfAllWithArguments(methods) {
  return function () {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    return invokeAllWithArguments(methods, args);
  };
};

/**
 * Returns a function used by Array#sort to sort queues by priority in fifo mode.
 * @param {Array} deprioritized Collects deprioritized enqueued items.
 * @returns {number} A sort result value.
 */
var prioritySortFIFO = function prioritySortFIFO(deprioritized) {
  return function (a, b) {
    var difference = Number(b.priority) - Number(a.priority);
    if (difference > 0 && deprioritized.indexOf(a) === -1) deprioritized.push(a);
    return difference;
  };
};

/**
 * Returns a function used by Array#sort to sort queues by priority in lifo mode.
 * @param {Array} deprioritized Collects deprioritized enqueued items.
 * @returns {number} A sort result value.
 */
var prioritySortLIFO = function prioritySortLIFO(deprioritized) {
  return function (a, b) {
    var difference = Number(a.priority) - Number(b.priority);
    if (difference < 0 && deprioritized.indexOf(a) === -1) deprioritized.push(a);
    return difference;
  };
};

/**
 * Similar to Array#findIndex (which is unsupported by IE).
 * @param {Array} collection The collection to find an index within.
 * @param {function} iteratee The function to invoke for each item.
 * @returns {number} The index of the found item, or -1.
 */
function findIndex(collection, iteratee) {
  var index = -1;

  collection.some(function (item, key) {
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
  var result = {};
  properties.forEach(function (property) {
    result[property] = source[property];
  });
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
  return '' + prefix + capitalize(methodName) + capitalize(suffix);
}

/**
 * The massaged dequeued object returned from PromiseQueue#clear and PromiseQueue#remove.
 * @param {object} dequeued An object dequeued from the queue.
 * @returns {object} The exportable queue object.
 */
function getExportableQueueObject(dequeued) {
  return _extends({}, pick(dequeued, PICK_FROM_ENQUEUED), {
    resolve: invokerOfAllWithArguments(dequeued.resolvers),
    reject: invokerOfAllWithArguments(dequeued.rejectors)
  });
}

/**
 * Used by Array.prototype.reduce to reduce the queue using the user's
 * `handleQueueReduction` method.
 * @param {function} handleQueueReduction The user's `handleQueueReduction` method.
 * @returns {function} A queue reducer, given a reducer function.
 */
function onQueueItemReduction(handleQueueReduction) {
  return function (reducedQueue, current, index, queue) {
    var previous = queue[index - 1] || null;

    var dropped = false;
    var combined = false;

    // Drops the enqueued method call.
    // Warning: this will cause promises to never resolve. For that
    // reason, this method returns the rejectors and resolvers.
    var drop = function drop() {
      dropped = true;
      return {
        resolve: invokerOfAllWithArguments(current.resolvers),
        reject: invokerOfAllWithArguments(current.rejectors)
      };
    };

    // Combines the previous and current enqueued methods.
    // This doesn't combine the functionality, but passes
    // all of the resolvers and rejectors to the previous
    // method invocation and drops the current one (effectively
    // "combining" the call into a single one).
    var combine = function combine() {
      if (!previous) throw new Error('Cannot combine queued method calls without a previous value.');
      combined = true;
    };

    var prev = previous && pick(previous, PICK_FROM_ENQUEUED);
    var curr = pick(current, PICK_FROM_ENQUEUED);
    handleQueueReduction(prev, curr, combine, drop);

    if (combined && dropped) {
      throw new Error('Cannot both combine and drop an enqueued method call.');
    }

    // If the calls were "combined", pass the resolvers and rejectors
    // of the current method to the previous one. If it wasn't dropped
    // keep the current method in the queue.
    if (combined) {
      var _previous$resolvers, _previous$rejectors;

      (_previous$resolvers = previous.resolvers).push.apply(_previous$resolvers, _toConsumableArray(current.resolvers));
      (_previous$rejectors = previous.rejectors).push.apply(_previous$rejectors, _toConsumableArray(current.rejectors));
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
function forEachOwnAndInheritedFunction(object, iteratee) {
  var handled = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

  // Don't promisify native prototype properties.
  if (!object || NATIVES_PROTOTYPES.indexOf(object) > -1) return;
  var visited = handled;

  // Iterate the object's own properties
  Object.getOwnPropertyNames(object).forEach(function (property) {
    if (visited[property]) return;
    visited[property] = true;

    var value = object[property];
    if (typeof value !== 'function' || property === 'constructor') return;
    iteratee(value, property);
  });

  // Iterate the object's constructor properties (static properties)
  if (NATIVES.indexOf(object.constructor) === -1) {
    Object.getOwnPropertyNames(object.constructor).forEach(function (property) {
      if (visited[property]) return;
      visited[property] = true;

      var value = object.constructor[property];
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
module.exports = function () {
  _createClass(PromiseQueue, null, [{
    key: 'queueify',

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
    value: function queueify(method) {
      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var _options$queue = options.queue,
          queue = _options$queue === undefined ? new PromiseQueue(options) : _options$queue,
          _options$context = options.context,
          context = _options$context === undefined ? queue : _options$context,
          _options$priority = options.priority,
          priority = _options$priority === undefined ? 0 : _options$priority;


      if (typeof method !== 'function') {
        throw new TypeError('You must pass a function for parameter "method" to queueify.');
      }

      if (!(queue instanceof PromiseQueue)) {
        throw new TypeError('PromiseQueue.queueify expected an instance of PromiseQueue for parameter "queue".');
      }

      var queueified = function queueified() {
        for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
          args[_key2] = arguments[_key2];
        }

        return queue.enqueue(method, { args: args, context: context, priority: priority });
      };
      queueified.queue = queue;

      return queueified;
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

  }, {
    key: 'queueifyAll',
    value: function queueifyAll(object) {
      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var _options$prefix = options.prefix,
          prefix = _options$prefix === undefined ? 'queued' : _options$prefix,
          _options$suffix = options.suffix,
          suffix = _options$suffix === undefined ? '' : _options$suffix,
          _options$priorities = options.priorities,
          priorities = _options$priorities === undefined ? {} : _options$priorities,
          _options$queue2 = options.queue,
          queue = _options$queue2 === undefined ? new PromiseQueue(options) : _options$queue2,
          _options$assignQueueA = options.assignQueueAsProperty,
          assignQueueAsProperty = _options$assignQueueA === undefined ? 'queue' : _options$assignQueueA;


      if ((typeof object === 'undefined' ? 'undefined' : _typeof(object)) !== 'object' || !Object.isExtensible(object)) {
        throw new Error('Cannot queueify a non-object or non-extensible object.');
      }

      var target = object;
      var functions = [];

      // Iterate over all of the object's own and inherited functions and queueify each method.
      // This will add a new propery on the object [prefix][method name][suffix].
      forEachOwnAndInheritedFunction(target, function (value, property) {
        return functions.push({ value: value, property: property });
      });

      functions.forEach(function (_ref) {
        var value = _ref.value,
            property = _ref.property;

        target[keyForQueueifiedMethod(property, prefix, suffix)] = PromiseQueue.queueify(value, {
          queue: queue,
          context: target,
          priority: Number(priorities[property]) || 0
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

  }]);

  function PromiseQueue() {
    var _ref2 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
        _ref2$lifo = _ref2.lifo,
        lifo = _ref2$lifo === undefined ? false : _ref2$lifo,
        onQueueDrained = _ref2.onQueueDrained,
        onMethodEnqueued = _ref2.onMethodEnqueued,
        _ref2$maxConcurrency = _ref2.maxConcurrency,
        maxConcurrency = _ref2$maxConcurrency === undefined ? 1 : _ref2$maxConcurrency,
        handleQueueReduction = _ref2.handleQueueReduction,
        onMethodDeprioritized = _ref2.onMethodDeprioritized;

    _classCallCheck(this, PromiseQueue);

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


  _createClass(PromiseQueue, [{
    key: 'setMaxConcurrency',


    /**
     * Sets the queue's maximum concurrency.
     * @param {number} maxConcurrency The concurrent value to set.
     * @returns {PromiseQueue} The current PromiseQueue instance for chaining.
     * @memberof PromiseQueue
     */
    value: function setMaxConcurrency(maxConcurrency) {
      this.maxConcurrency = Math.max(Number(maxConcurrency) || 1, 1);
      return this;
    }

    /**
     * Called when a task has started processing.
     * @returns {undefined}
     * @memberof PromiseQueue
     */

  }, {
    key: 'onMethodStarted',
    value: function onMethodStarted() {
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

  }, {
    key: 'onMethodCompleted',
    value: function onMethodCompleted(resolvers, result) {
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

  }, {
    key: 'tick',
    value: function tick() {
      var _this = this;

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

      var _queue = this.queue[this.lifo ? 'pop' : 'shift'](),
          args = _queue.args,
          method = _queue.method,
          context = _queue.context,
          resolvers = _queue.resolvers,
          rejectors = _queue.rejectors;

      // We must call the function imediately since we've already
      // deferred invocation once (in `enqueue`). Otherwise, we will
      // get a strange order of execution.


      var returned = void 0;

      try {
        returned = method.call.apply(method, [context].concat(_toConsumableArray(args)));

        if (returned && returned[IS_PROMISE_QUEUE_PROMISE]) {
          throw new Error('Queue out of order execution: cannot resolve with something that ' + "won't be called until this function completes.");
        }
      } catch (e) {
        this.onMethodCompleted(rejectors, e);
        return;
      }

      Promise.resolve(returned).catch(function (e) {
        return _this.onMethodCompleted(rejectors, e);
      }).then(function (results) {
        return _this.onMethodCompleted(resolvers, results);
      });
    }

    /**
     * Sorts the queue based on priorities.
     * @returns {undefined}
     * @memberof PromiseQueue
     */

  }, {
    key: 'prioritizeQueue',
    value: function prioritizeQueue() {
      var _this2 = this;

      var deprioritized = [];
      var sorter = this.lifo ? prioritySortLIFO : prioritySortFIFO;
      this.queue.sort(sorter(deprioritized));

      if (typeof this.onMethodDeprioritized === 'function') {
        deprioritized.forEach(function (enqueued) {
          var prio = Number(_this2.onMethodDeprioritized(pick(enqueued, PICK_FROM_ENQUEUED))) || 0;
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

  }, {
    key: 'reduceQueue',
    value: function reduceQueue() {
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

  }, {
    key: 'enqueue',
    value: function enqueue(method) {
      var _this3 = this;

      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      var enqueuedMethodPromise = new Promise(function (resolve, reject) {
        var _options$args = options.args,
            args = _options$args === undefined ? [] : _options$args,
            _options$priority2 = options.priority,
            priority = _options$priority2 === undefined ? 0 : _options$priority2,
            _options$context2 = options.context,
            context = _options$context2 === undefined ? _this3 : _options$context2;


        if (typeof method !== 'function') {
          return reject(new TypeError('PromiseQueue#enqueue expected a function for argument "method".'));
        }

        if (!(args instanceof Array)) {
          return reject(new TypeError('PromiseQueue#enqueue expected an array for argument "options.args".'));
        }

        _this3.queue.push({
          args: args,
          method: method,
          context: context,
          priority: Number(priority) || 0,
          rejectors: [reject],
          resolvers: [resolve]
        });

        _this3.isDrained = false;

        // Toggles the queue from un-sorted mode to priority sort mode.
        if (Number(priority) !== 0) _this3.prioritySortMode = true;

        // First prioritize the queue (sort it by priorities),
        // then allow the user the opportunity to reduce it.
        if (_this3.prioritySortMode) _this3.prioritizeQueue();
        _this3.reduceQueue();

        if (typeof _this3.onMethodEnqueued === 'function') {
          _this3.onMethodEnqueued(method, options);
        }

        // Defer the execution of the tick until the next iteration of the event loop
        // This is important so we allow all synchronous "enqueues" occur before any
        // enqueued methods are actually invoked.
        Promise.resolve().then(function () {
          return _this3.tick();
        });
        return undefined;
      });

      enqueuedMethodPromise[IS_PROMISE_QUEUE_PROMISE] = true;
      return enqueuedMethodPromise;
    }

    /**
     * @returns {Array<function>} A shallow copy of the queue's enqueued methods.
     * @memberof PromiseQueue
     */

  }, {
    key: 'getEnqueuedMethods',
    value: function getEnqueuedMethods() {
      return this.queue.map(function (_ref3) {
        var method = _ref3.method;
        return method;
      });
    }

    /**
     * Clears all enqueued methods from the queue. Any method that's already
     * been dequeued will still run to completion.
     * @returns {PromiseQueue} The current PromiseQueue instance for chaining.
     * @memberof PromiseQueue
     */

  }, {
    key: 'clear',
    value: function clear() {
      var values = this.queue.map(getExportableQueueObject);
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

  }, {
    key: 'remove',
    value: function remove(method) {
      if (typeof method !== 'function') return null;
      var index = findIndex(this.queue, function (_ref4) {
        var enqueued = _ref4.method;
        return enqueued === method;
      });
      return index !== -1 ? getExportableQueueObject(this.queue.splice(index, 1)[0]) : null;
    }

    /**
     * Pauses the queue.
     * @returns {PromiseQueue} The current PromiseQueue instance for chaining.
     * @memberof PromiseQueue
     */

  }, {
    key: 'pause',
    value: function pause() {
      this.isPaused = true;
      return this;
    }

    /**
     * Resumes the queue.
     * @returns {PromiseQueue} The current PromiseQueue instance for chaining.
     * @memberof PromiseQueue
     */

  }, {
    key: 'resume',
    value: function resume() {
      if (this.isPaused) {
        this.isPaused = false;
        this.tick();
      }

      return this;
    }
  }, {
    key: 'size',
    get: function get() {
      return this.queue.length;
    }

    /**
     * An alias for "enqueue".
     * If in lifo mode this verb might be more correct.
     * @readonly
     */

  }, {
    key: 'push',
    get: function get() {
      return this.enqueue;
    }
  }]);

  return PromiseQueue;
}();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9Qcm9taXNlUXVldWUuanMiXSwibmFtZXMiOlsiSVNfUFJPTUlTRV9RVUVVRV9QUk9NSVNFIiwiUElDS19GUk9NX0VOUVVFVUVEIiwiTkFUSVZFU19QUk9UT1RZUEVTIiwiT2JqZWN0IiwiZ2V0UHJvdG90eXBlT2YiLCJBcnJheSIsIlN0cmluZyIsIk51bWJlciIsIkJvb2xlYW4iLCJGdW5jdGlvbiIsIk5BVElWRVMiLCJjYXBpdGFsaXplIiwicyIsImNoYXJBdCIsInRvVXBwZXJDYXNlIiwic2xpY2UiLCJpbnZva2VBbGxXaXRoQXJndW1lbnRzIiwibWV0aG9kcyIsImFyZ3MiLCJmb3JFYWNoIiwibWV0aG9kIiwiaW52b2tlck9mQWxsV2l0aEFyZ3VtZW50cyIsInByaW9yaXR5U29ydEZJRk8iLCJhIiwiYiIsImRpZmZlcmVuY2UiLCJwcmlvcml0eSIsImRlcHJpb3JpdGl6ZWQiLCJpbmRleE9mIiwicHVzaCIsInByaW9yaXR5U29ydExJRk8iLCJmaW5kSW5kZXgiLCJjb2xsZWN0aW9uIiwiaXRlcmF0ZWUiLCJpbmRleCIsInNvbWUiLCJpdGVtIiwia2V5IiwicGljayIsInNvdXJjZSIsInByb3BlcnRpZXMiLCJyZXN1bHQiLCJwcm9wZXJ0eSIsImtleUZvclF1ZXVlaWZpZWRNZXRob2QiLCJtZXRob2ROYW1lIiwicHJlZml4Iiwic3VmZml4IiwiZ2V0RXhwb3J0YWJsZVF1ZXVlT2JqZWN0IiwiZGVxdWV1ZWQiLCJyZXNvbHZlIiwicmVzb2x2ZXJzIiwicmVqZWN0IiwicmVqZWN0b3JzIiwib25RdWV1ZUl0ZW1SZWR1Y3Rpb24iLCJoYW5kbGVRdWV1ZVJlZHVjdGlvbiIsInJlZHVjZWRRdWV1ZSIsImN1cnJlbnQiLCJxdWV1ZSIsInByZXZpb3VzIiwiZHJvcHBlZCIsImNvbWJpbmVkIiwiZHJvcCIsImNvbWJpbmUiLCJFcnJvciIsInByZXYiLCJjdXJyIiwiZm9yRWFjaE93bkFuZEluaGVyaXRlZEZ1bmN0aW9uIiwib2JqZWN0IiwiaGFuZGxlZCIsInZpc2l0ZWQiLCJnZXRPd25Qcm9wZXJ0eU5hbWVzIiwidmFsdWUiLCJjb25zdHJ1Y3RvciIsIm1vZHVsZSIsImV4cG9ydHMiLCJvcHRpb25zIiwiUHJvbWlzZVF1ZXVlIiwiY29udGV4dCIsIlR5cGVFcnJvciIsInF1ZXVlaWZpZWQiLCJlbnF1ZXVlIiwicHJpb3JpdGllcyIsImFzc2lnblF1ZXVlQXNQcm9wZXJ0eSIsImlzRXh0ZW5zaWJsZSIsInRhcmdldCIsImZ1bmN0aW9ucyIsInF1ZXVlaWZ5IiwibGlmbyIsIm9uUXVldWVEcmFpbmVkIiwib25NZXRob2RFbnF1ZXVlZCIsIm1heENvbmN1cnJlbmN5Iiwib25NZXRob2REZXByaW9yaXRpemVkIiwicnVubmluZyIsImlzRHJhaW5lZCIsImlzUGF1c2VkIiwic2V0TWF4Q29uY3VycmVuY3kiLCJwcmlvcml0eVNvcnRNb2RlIiwiTWF0aCIsIm1heCIsInRpY2siLCJsZW5ndGgiLCJvbk1ldGhvZFN0YXJ0ZWQiLCJyZXR1cm5lZCIsImNhbGwiLCJlIiwib25NZXRob2RDb21wbGV0ZWQiLCJQcm9taXNlIiwiY2F0Y2giLCJ0aGVuIiwicmVzdWx0cyIsInNvcnRlciIsInNvcnQiLCJlbnF1ZXVlZCIsInByaW8iLCJyZWR1Y2UiLCJlbnF1ZXVlZE1ldGhvZFByb21pc2UiLCJwcmlvcml0aXplUXVldWUiLCJyZWR1Y2VRdWV1ZSIsInVuZGVmaW5lZCIsIm1hcCIsInZhbHVlcyIsInNwbGljZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQUE7Ozs7Ozs7Ozs7Ozs7QUFhQTs7Ozs7QUFLQSxJQUFNQSwyQkFBMkIsOEJBQWpDOztBQUVBOzs7OztBQUtBLElBQU1DLHFCQUFxQixDQUFDLE1BQUQsRUFBUyxRQUFULEVBQW1CLFVBQW5CLEVBQStCLFNBQS9CLENBQTNCOztBQUVBOzs7Ozs7QUFNQSxJQUFNQyxxQkFBcUIsQ0FDekJDLE9BQU9DLGNBQVAsQ0FBc0JELE1BQXRCLENBRHlCLEVBRXpCQSxPQUFPQyxjQUFQLENBQXNCQyxLQUF0QixDQUZ5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S0FBTCxDQUFXOEQsR0FBWCxDQUFleEUsd0JBQWYsQ0FBZjtBQUNBLFdBQUtVLEtBQUwsR0FBYSxFQUFiO0FBQ0EsYUFBTytELE1BQVA7QUFDRDs7QUFFRDs7Ozs7Ozs7QUF0VkY7QUFBQTtBQUFBLDJCQTZWU3BHLE1BN1ZULEVBNlZpQjtBQUNiLFVBQUksT0FBT0EsTUFBUCxLQUFrQixVQUF0QixFQUFrQyxPQUFPLElBQVA7QUFDbEMsVUFBTWMsUUFBUUgsVUFBVSxLQUFLMEIsS0FBZixFQUFzQjtBQUFBLFlBQVd1RCxRQUFYLFNBQUc1RixNQUFIO0FBQUEsZUFBMEI0RixhQUFhNUYsTUFBdkM7QUFBQSxPQUF0QixDQUFkO0FBQ0EsYUFBT2MsVUFBVSxDQUFDLENBQVgsR0FBZWEseUJBQXlCLEtBQUtVLEtBQUwsQ0FBV2dFLE1BQVgsQ0FBa0J2RixLQUFsQixFQUF5QixDQUF6QixFQUE0QixDQUE1QixDQUF6QixDQUFmLEdBQTBFLElBQWpGO0FBQ0Q7O0FBRUQ7Ozs7OztBQW5XRjtBQUFBO0FBQUEsNEJBd1dVO0FBQ04sV0FBSzRELFFBQUwsR0FBZ0IsSUFBaEI7QUFDQSxhQUFPLElBQVA7QUFDRDs7QUFFRDs7Ozs7O0FBN1dGO0FBQUE7QUFBQSw2QkFrWFc7QUFDUCxVQUFJLEtBQUtBLFFBQVQsRUFBbUI7QUFDakIsYUFBS0EsUUFBTCxHQUFnQixLQUFoQjtBQUNBLGFBQUtLLElBQUw7QUFDRDs7QUFFRCxhQUFPLElBQVA7QUFDRDtBQXpYSDtBQUFBO0FBQUEsd0JBc0lhO0FBQ1QsYUFBTyxLQUFLMUMsS0FBTCxDQUFXMkMsTUFBbEI7QUFDRDs7QUFFRDs7Ozs7O0FBMUlGO0FBQUE7QUFBQSx3QkErSWE7QUFDVCxhQUFPLEtBQUtwQixPQUFaO0FBQ0Q7QUFqSkg7O0FBQUE7QUFBQSIsImZpbGUiOiJQcm9taXNlUXVldWUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEEgaGlnaGx5IGZsZXhpYmxlIHF1ZXVlIHRoYXQgcnVucyBgbWF4Q29uY3VycmVuY3lgIG1ldGhvZHMgYXQgYSB0aW1lXG4gKiBhbmQgd2FpdHMgZm9yIGVhY2ggbWV0aG9kIHRvIHJlc29sdmUgYmVmb3JlIGNhbGxpbmcgdGhlIG5leHQuXG4gKlxuICogU3VwcG9ydCBmb3IgcXVldWUgcGF1c2luZywgcHJpb3JpdGl6YXRpb24sIHJlZHVjdGlvbiBhbmQgYm90aCBGSUZPIGFuZCBMSUZPIG1vZGVzLlxuICogV29ya3MgaW4gYm90aCBicm93c2VycyBhbmQgbm9kZS5qcy5cbiAqXG4gKiBSZXF1aXJlbWVudHM6IFByb21pc2Ugc3VwcG9ydC9wb2x5ZmlsbFxuICogQGF1dGhvciBKYXNvbiBQb2xsbWFuIDxqYXNvbmpwb2xsbWFuQGdtYWlsLmNvbT5cbiAqIEBzaW5jZSAzLzE1LzE4XG4gKiBAZmlsZVxuICovXG5cbi8qKlxuICogQXNzaWduZWQgdG8gZXZlcnkgcHJvbWlzZSByZXR1cm5lZCBmcm9tIFByb21pc2VRdWV1ZSNlbnF1ZXVlXG4gKiB0byBlbnN1cmUgdGhlIHVzZXIgaXNuJ3QgcmV0dXJuaW5nIGFub3RoZXIgcW5ldWV1ZWQgcHJvbWlzZS5cbiAqIEB0eXBlIHtzdHJpbmd9XG4gKi9cbmNvbnN0IElTX1BST01JU0VfUVVFVUVfUFJPTUlTRSA9ICdfX0lTX1BST01JU0VfUVVFVUVfUFJPTUlTRV9fJztcblxuLyoqXG4gKiBUaGUgcHJvcGVydGllcyBwaWNrZWQgZnJvbSBlYWNoIGVucXVldWVkIGl0ZW0gd2hlblxuICogcGFzc2VkIHRvIHVzZXIgbWV0aG9kcyAoZm9yIGVuY2Fwc3VsYXRpb24gYW5kIHRvIHByZXZlbnQgbXV0YXRpb24pLlxuICogQHR5cGUge0FycmF5PHN0cmluZz59XG4gKi9cbmNvbnN0IFBJQ0tfRlJPTV9FTlFVRVVFRCA9IFsnYXJncycsICdtZXRob2QnLCAncHJpb3JpdHknLCAnY29udGV4dCddO1xuXG4vKipcbiAqIE5hdGl2ZSBwcm90b3R5cGUgcHJvcGVydGllcy5cbiAqIFRoaXMgaXMgdGhlIHNldCBvZiBwcm90b3R5cGVzIHdoaWNoIHdlIGRvbid0IHdhbnQgdG8gcXVldWVpZnkgd2hlbiBydW5uaW5nXG4gKiBgcXVldWVpZnlBbGxgIG9uIGFuIG9iamVjdCBhbmQgd2Fsa2luZyBpdCdzIHByb3RvdHlwZSBjaGFpbi5cbiAqIEB0eXBlIHtBcnJheTxvYmplY3Q+fVxuICovXG5jb25zdCBOQVRJVkVTX1BST1RPVFlQRVMgPSBbXG4gIE9iamVjdC5nZXRQcm90b3R5cGVPZihPYmplY3QpLFxuICBPYmplY3QuZ2V0UHJvdG90eXBlT2YoQXJyYXkpLFxuICBPYmplY3QuZ2V0UHJvdG90eXBlT2YoU3RyaW5nKSxcbiAgT2JqZWN0LmdldFByb3RvdHlwZU9mKE51bWJlciksXG4gIE9iamVjdC5nZXRQcm90b3R5cGVPZihCb29sZWFuKSxcbiAgT2JqZWN0LmdldFByb3RvdHlwZU9mKEZ1bmN0aW9uKSxcbl07XG5cbi8qKlxuICogVGhlIHNldCBvZiBuYXRpdmUgc3RhdGljIHByb3BlcnRpZXMgd2UgZG9uJ3Qgd2FudCB0byBxdWV1ZWlmeS5cbiAqIEB0eXBlIHtBcnJheTxmdW5jdGlvbj59XG4gKi9cbmNvbnN0IE5BVElWRVMgPSBbXG4gIE9iamVjdCxcbiAgQXJyYXksXG4gIFN0cmluZyxcbiAgTnVtYmVyLFxuICBCb29sZWFuLFxuICBGdW5jdGlvbixcbl07XG5cbi8qKlxuICogQ2FwaXRhbGl6ZXMgdGhlIGZpcnN0IGNoYXJhY3RlciBvZiBhIHN0cmluZy5cbiAqIEBwYXJhbSB7c3RyaW5nfSBzIFRoZSBzdHJpbmcgdG8gY2FwaXRhbGl6ZS5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFRoZSBjYXBpdGFsaXplZCBzdHJpbmcuXG4gKi9cbmNvbnN0IGNhcGl0YWxpemUgPSBzID0+IHMuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBzLnNsaWNlKDEpO1xuXG4vKipcbiAqIEludm9rZXMgdGhlIGdpdmVuIGFycmF5IG9mIGZ1bmN0aW9ucyB3aXRoIHRoZSBnaXZlbiBhcnJheSBvZiBhcmd1bWVudHMuXG4gKiBAcGFyYW0ge0FycmF5PGZ1bmN0aW9uPn0gbWV0aG9kcyBBbiBhcnJheSBvZiBtZXRob2RzIHRvIGludm9rZS5cbiAqIEBwYXJhbSB7QXJyYXl9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byBpbnZva2UgdGhlIG1ldGhvZCB3aXRoLlxuICogQHJldHVybnMge3VuZGVmaW5lZH1cbiAqL1xuY29uc3QgaW52b2tlQWxsV2l0aEFyZ3VtZW50cyA9IChtZXRob2RzLCBhcmdzKSA9PiBtZXRob2RzLmZvckVhY2gobWV0aG9kID0+IG1ldGhvZCguLi5hcmdzKSk7XG5cbi8qKlxuICogQ3VycmllZCB2ZXJzaW9uIG9mIGBpbnZva2VBbGxXaXRoQXJndW1lbnRzYC5cbiAqIEBwYXJhbSB7QXJyYXk8ZnVuY3Rpb24+fSBtZXRob2RzIEFuIGFycmF5IG9mIG1ldGhvZHMgdG8gaW52b2tlLlxuICogQHJldHVybnMge3VuZGVmaW5lZH1cbiAqL1xuY29uc3QgaW52b2tlck9mQWxsV2l0aEFyZ3VtZW50cyA9IG1ldGhvZHMgPT4gKC4uLmFyZ3MpID0+IGludm9rZUFsbFdpdGhBcmd1bWVudHMobWV0aG9kcywgYXJncyk7XG5cbi8qKlxuICogUmV0dXJucyBhIGZ1bmN0aW9uIHVzZWQgYnkgQXJyYXkjc29ydCB0byBzb3J0IHF1ZXVlcyBieSBwcmlvcml0eSBpbiBmaWZvIG1vZGUuXG4gKiBAcGFyYW0ge0FycmF5fSBkZXByaW9yaXRpemVkIENvbGxlY3RzIGRlcHJpb3JpdGl6ZWQgZW5xdWV1ZWQgaXRlbXMuXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBBIHNvcnQgcmVzdWx0IHZhbHVlLlxuICovXG5jb25zdCBwcmlvcml0eVNvcnRGSUZPID0gZGVwcmlvcml0aXplZCA9PiAoYSwgYikgPT4ge1xuICBjb25zdCBkaWZmZXJlbmNlID0gTnVtYmVyKGIucHJpb3JpdHkpIC0gTnVtYmVyKGEucHJpb3JpdHkpO1xuICBpZiAoZGlmZmVyZW5jZSA+IDAgJiYgZGVwcmlvcml0aXplZC5pbmRleE9mKGEpID09PSAtMSkgZGVwcmlvcml0aXplZC5wdXNoKGEpO1xuICByZXR1cm4gZGlmZmVyZW5jZTtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIGZ1bmN0aW9uIHVzZWQgYnkgQXJyYXkjc29ydCB0byBzb3J0IHF1ZXVlcyBieSBwcmlvcml0eSBpbiBsaWZvIG1vZGUuXG4gKiBAcGFyYW0ge0FycmF5fSBkZXByaW9yaXRpemVkIENvbGxlY3RzIGRlcHJpb3JpdGl6ZWQgZW5xdWV1ZWQgaXRlbXMuXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBBIHNvcnQgcmVzdWx0IHZhbHVlLlxuICovXG5jb25zdCBwcmlvcml0eVNvcnRMSUZPID0gZGVwcmlvcml0aXplZCA9PiAoYSwgYikgPT4ge1xuICBjb25zdCBkaWZmZXJlbmNlID0gTnVtYmVyKGEucHJpb3JpdHkpIC0gTnVtYmVyKGIucHJpb3JpdHkpO1xuICBpZiAoZGlmZmVyZW5jZSA8IDAgJiYgZGVwcmlvcml0aXplZC5pbmRleE9mKGEpID09PSAtMSkgZGVwcmlvcml0aXplZC5wdXNoKGEpO1xuICByZXR1cm4gZGlmZmVyZW5jZTtcbn07XG5cbi8qKlxuICogU2ltaWxhciB0byBBcnJheSNmaW5kSW5kZXggKHdoaWNoIGlzIHVuc3VwcG9ydGVkIGJ5IElFKS5cbiAqIEBwYXJhbSB7QXJyYXl9IGNvbGxlY3Rpb24gVGhlIGNvbGxlY3Rpb24gdG8gZmluZCBhbiBpbmRleCB3aXRoaW4uXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBpdGVyYXRlZSBUaGUgZnVuY3Rpb24gdG8gaW52b2tlIGZvciBlYWNoIGl0ZW0uXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgaW5kZXggb2YgdGhlIGZvdW5kIGl0ZW0sIG9yIC0xLlxuICovXG5mdW5jdGlvbiBmaW5kSW5kZXgoY29sbGVjdGlvbiwgaXRlcmF0ZWUpIHtcbiAgbGV0IGluZGV4ID0gLTE7XG5cbiAgY29sbGVjdGlvbi5zb21lKChpdGVtLCBrZXkpID0+IHtcbiAgICBpZiAoIWl0ZXJhdGVlKGl0ZW0sIGtleSwgY29sbGVjdGlvbikpIHJldHVybiBmYWxzZTtcbiAgICBpbmRleCA9IGtleTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgcmV0dXJuIGluZGV4O1xufVxuXG4vKipcbiAqIEEgc2ltcGxpZmllZCB2ZXJzaW9uIGxvZGFzaCdzIHBpY2suXG4gKiBAcGFyYW0ge29iamVjdH0gc291cmNlIFRoZSBzb3VyY2Ugb2JqZWN0IHRvIHBpY2sgdGhlIHByb3BlcnRpZXMgZnJvbS5cbiAqIEBwYXJhbSB7QXJyYXk8c3RyaW5nPn0gcHJvcGVydGllcyBUaGUgcHJvcGVydGllcyB0byBwaWNrIGZyb20gdGhlIG9iamVjdC5cbiAqIEByZXR1cm5zIHtvYmplY3R9IEEgbmV3IG9iamVjdCBjb250YWluaW5nIHRoZSBzcGVjaWZpZWQgcHJvcGVydGllcy5cbiAqL1xuZnVuY3Rpb24gcGljayhzb3VyY2UsIHByb3BlcnRpZXMpIHtcbiAgY29uc3QgcmVzdWx0ID0ge307XG4gIHByb3BlcnRpZXMuZm9yRWFjaCgocHJvcGVydHkpID0+IHsgcmVzdWx0W3Byb3BlcnR5XSA9IHNvdXJjZVtwcm9wZXJ0eV07IH0pO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIGZ1bmN0aW9uIG5hbWUgZm9yIGEgcXVldWVpZmllZCBtZXRob2QgKHVzaW5nIHByZWZpeCBhbmQgc3VmZml4KS5cbiAqIEBwYXJhbSB7c3RyaW5nfSBtZXRob2ROYW1lIFRoZSBuYW1lIG9mIHRoZSBtZXRob2QgdG8gZ2V0IHRoZSBxdWV1ZWlmeSBrZXkgb2YuXG4gKiBAcGFyYW0ge3N0cmluZ30gcHJlZml4IFRoZSBrZXkgcHJlZml4LlxuICogQHBhcmFtIHtzdHJpbmd9IHN1ZmZpeCBUaGUga2V5IHN1ZmZpeC5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFRoZSBxdWV1ZWlmaWVkIGZ1bmN0aW9uIG5hbWUgb2YgXCJtZXRob2ROYW1lXCIuXG4gKi9cbmZ1bmN0aW9uIGtleUZvclF1ZXVlaWZpZWRNZXRob2QobWV0aG9kTmFtZSwgcHJlZml4LCBzdWZmaXgpIHtcbiAgcmV0dXJuIGAke3ByZWZpeH0ke2NhcGl0YWxpemUobWV0aG9kTmFtZSl9JHtjYXBpdGFsaXplKHN1ZmZpeCl9YDtcbn1cblxuLyoqXG4gKiBUaGUgbWFzc2FnZWQgZGVxdWV1ZWQgb2JqZWN0IHJldHVybmVkIGZyb20gUHJvbWlzZVF1ZXVlI2NsZWFyIGFuZCBQcm9taXNlUXVldWUjcmVtb3ZlLlxuICogQHBhcmFtIHtvYmplY3R9IGRlcXVldWVkIEFuIG9iamVjdCBkZXF1ZXVlZCBmcm9tIHRoZSBxdWV1ZS5cbiAqIEByZXR1cm5zIHtvYmplY3R9IFRoZSBleHBvcnRhYmxlIHF1ZXVlIG9iamVjdC5cbiAqL1xuZnVuY3Rpb24gZ2V0RXhwb3J0YWJsZVF1ZXVlT2JqZWN0KGRlcXVldWVkKSB7XG4gIHJldHVybiB7XG4gICAgLi4ucGljayhkZXF1ZXVlZCwgUElDS19GUk9NX0VOUVVFVUVEKSxcbiAgICByZXNvbHZlOiBpbnZva2VyT2ZBbGxXaXRoQXJndW1lbnRzKGRlcXVldWVkLnJlc29sdmVycyksXG4gICAgcmVqZWN0OiBpbnZva2VyT2ZBbGxXaXRoQXJndW1lbnRzKGRlcXVldWVkLnJlamVjdG9ycyksXG4gIH07XG59XG5cbi8qKlxuICogVXNlZCBieSBBcnJheS5wcm90b3R5cGUucmVkdWNlIHRvIHJlZHVjZSB0aGUgcXVldWUgdXNpbmcgdGhlIHVzZXInc1xuICogYGhhbmRsZVF1ZXVlUmVkdWN0aW9uYCBtZXRob2QuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBoYW5kbGVRdWV1ZVJlZHVjdGlvbiBUaGUgdXNlcidzIGBoYW5kbGVRdWV1ZVJlZHVjdGlvbmAgbWV0aG9kLlxuICogQHJldHVybnMge2Z1bmN0aW9ufSBBIHF1ZXVlIHJlZHVjZXIsIGdpdmVuIGEgcmVkdWNlciBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gb25RdWV1ZUl0ZW1SZWR1Y3Rpb24oaGFuZGxlUXVldWVSZWR1Y3Rpb24pIHtcbiAgcmV0dXJuIChyZWR1Y2VkUXVldWUsIGN1cnJlbnQsIGluZGV4LCBxdWV1ZSkgPT4ge1xuICAgIGNvbnN0IHByZXZpb3VzID0gcXVldWVbaW5kZXggLSAxXSB8fCBudWxsO1xuXG4gICAgbGV0IGRyb3BwZWQgPSBmYWxzZTtcbiAgICBsZXQgY29tYmluZWQgPSBmYWxzZTtcblxuICAgIC8vIERyb3BzIHRoZSBlbnF1ZXVlZCBtZXRob2QgY2FsbC5cbiAgICAvLyBXYXJuaW5nOiB0aGlzIHdpbGwgY2F1c2UgcHJvbWlzZXMgdG8gbmV2ZXIgcmVzb2x2ZS4gRm9yIHRoYXRcbiAgICAvLyByZWFzb24sIHRoaXMgbWV0aG9kIHJldHVybnMgdGhlIHJlamVjdG9ycyBhbmQgcmVzb2x2ZXJzLlxuICAgIGNvbnN0IGRyb3AgPSAoKSA9PiB7XG4gICAgICBkcm9wcGVkID0gdHJ1ZTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJlc29sdmU6IGludm9rZXJPZkFsbFdpdGhBcmd1bWVudHMoY3VycmVudC5yZXNvbHZlcnMpLFxuICAgICAgICByZWplY3Q6IGludm9rZXJPZkFsbFdpdGhBcmd1bWVudHMoY3VycmVudC5yZWplY3RvcnMpLFxuICAgICAgfTtcbiAgICB9O1xuXG4gICAgLy8gQ29tYmluZXMgdGhlIHByZXZpb3VzIGFuZCBjdXJyZW50IGVucXVldWVkIG1ldGhvZHMuXG4gICAgLy8gVGhpcyBkb2Vzbid0IGNvbWJpbmUgdGhlIGZ1bmN0aW9uYWxpdHksIGJ1dCBwYXNzZXNcbiAgICAvLyBhbGwgb2YgdGhlIHJlc29sdmVycyBhbmQgcmVqZWN0b3JzIHRvIHRoZSBwcmV2aW91c1xuICAgIC8vIG1ldGhvZCBpbnZvY2F0aW9uIGFuZCBkcm9wcyB0aGUgY3VycmVudCBvbmUgKGVmZmVjdGl2ZWx5XG4gICAgLy8gXCJjb21iaW5pbmdcIiB0aGUgY2FsbCBpbnRvIGEgc2luZ2xlIG9uZSkuXG4gICAgY29uc3QgY29tYmluZSA9ICgpID0+IHtcbiAgICAgIGlmICghcHJldmlvdXMpIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGNvbWJpbmUgcXVldWVkIG1ldGhvZCBjYWxscyB3aXRob3V0IGEgcHJldmlvdXMgdmFsdWUuJyk7XG4gICAgICBjb21iaW5lZCA9IHRydWU7XG4gICAgfTtcblxuICAgIGNvbnN0IHByZXYgPSBwcmV2aW91cyAmJiBwaWNrKHByZXZpb3VzLCBQSUNLX0ZST01fRU5RVUVVRUQpO1xuICAgIGNvbnN0IGN1cnIgPSBwaWNrKGN1cnJlbnQsIFBJQ0tfRlJPTV9FTlFVRVVFRCk7XG4gICAgaGFuZGxlUXVldWVSZWR1Y3Rpb24ocHJldiwgY3VyciwgY29tYmluZSwgZHJvcCk7XG5cbiAgICBpZiAoY29tYmluZWQgJiYgZHJvcHBlZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgYm90aCBjb21iaW5lIGFuZCBkcm9wIGFuIGVucXVldWVkIG1ldGhvZCBjYWxsLicpO1xuICAgIH1cblxuICAgIC8vIElmIHRoZSBjYWxscyB3ZXJlIFwiY29tYmluZWRcIiwgcGFzcyB0aGUgcmVzb2x2ZXJzIGFuZCByZWplY3RvcnNcbiAgICAvLyBvZiB0aGUgY3VycmVudCBtZXRob2QgdG8gdGhlIHByZXZpb3VzIG9uZS4gSWYgaXQgd2Fzbid0IGRyb3BwZWRcbiAgICAvLyBrZWVwIHRoZSBjdXJyZW50IG1ldGhvZCBpbiB0aGUgcXVldWUuXG4gICAgaWYgKGNvbWJpbmVkKSB7XG4gICAgICBwcmV2aW91cy5yZXNvbHZlcnMucHVzaCguLi5jdXJyZW50LnJlc29sdmVycyk7XG4gICAgICBwcmV2aW91cy5yZWplY3RvcnMucHVzaCguLi5jdXJyZW50LnJlamVjdG9ycyk7XG4gICAgfSBlbHNlIGlmICghZHJvcHBlZCkge1xuICAgICAgcmVkdWNlZFF1ZXVlLnB1c2goY3VycmVudCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZHVjZWRRdWV1ZTtcbiAgfTtcbn1cblxuLyoqXG4gKiBJdGVyYXRlcyBhbiBvYmplY3QncyBvd24gYW5kIGluaGVyaXRlZCBmdW5jdGlvbnMgYW5kIHdhbGtzIHRoZSBwcm90b3R5cGUgY2hhaW4gdW50aWxcbiAqIE9iamVjdC5wcm90b3R5cGUgaXMgcmVhY2hlZC4gVGhpcyB3aWxsIGJlIHVzZWQgdG8gcXVldWVpZnkgaW5oZXJpdGVkIGZ1bmN0aW9ucyBiZWxvdy5cbiAqIEBwYXJhbSB7b2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBjYWxsIGBpdGVyYXRlZWAgb24gZm9yIGVhY2ggb3duIGFuZCBpbmhlcml0ZWQgcHJvcGVydHkuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBpdGVyYXRlZSBUaGUgY2FsbGJhY2sgdG8gaW52b2tlIGZvciBlYWNoIHByb3BlcnR5LlxuICogQHBhcmFtIHtvYmplY3R9IGhhbmRsZWQgS2VlcHMgdHJhY2sgb2YgcHJvcGVydGllcyB0aGF0IGhhdmUgYWxyZWFkeSBiZWVuIHF1ZXVlaWZpZWRcbiAqIGxvd2VyIGRvd24gaW4gdGhlIHByb3RvdHlwZSBjaGFpbiB0byBwcmV2ZW50IG92ZXJ3cml0aW5nIHByZXZpb3VzIHF1ZXVlaWZpY2F0aW9ucy5cbiAqIEByZXR1cm5zIHt1bmRlZmluZWR9XG4gKi9cbmZ1bmN0aW9uIGZvckVhY2hPd25BbmRJbmhlcml0ZWRGdW5jdGlvbihvYmplY3QsIGl0ZXJhdGVlLCBoYW5kbGVkID0ge30pIHtcbiAgLy8gRG9uJ3QgcHJvbWlzaWZ5IG5hdGl2ZSBwcm90b3R5cGUgcHJvcGVydGllcy5cbiAgaWYgKCFvYmplY3QgfHwgTkFUSVZFU19QUk9UT1RZUEVTLmluZGV4T2Yob2JqZWN0KSA+IC0xKSByZXR1cm47XG4gIGNvbnN0IHZpc2l0ZWQgPSBoYW5kbGVkO1xuXG4gIC8vIEl0ZXJhdGUgdGhlIG9iamVjdCdzIG93biBwcm9wZXJ0aWVzXG4gIE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKG9iamVjdCkuZm9yRWFjaCgocHJvcGVydHkpID0+IHtcbiAgICBpZiAodmlzaXRlZFtwcm9wZXJ0eV0pIHJldHVybjtcbiAgICB2aXNpdGVkW3Byb3BlcnR5XSA9IHRydWU7XG5cbiAgICBjb25zdCB2YWx1ZSA9IG9iamVjdFtwcm9wZXJ0eV07XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ2Z1bmN0aW9uJyB8fCBwcm9wZXJ0eSA9PT0gJ2NvbnN0cnVjdG9yJykgcmV0dXJuO1xuICAgIGl0ZXJhdGVlKHZhbHVlLCBwcm9wZXJ0eSk7XG4gIH0pO1xuXG4gIC8vIEl0ZXJhdGUgdGhlIG9iamVjdCdzIGNvbnN0cnVjdG9yIHByb3BlcnRpZXMgKHN0YXRpYyBwcm9wZXJ0aWVzKVxuICBpZiAoTkFUSVZFUy5pbmRleE9mKG9iamVjdC5jb25zdHJ1Y3RvcikgPT09IC0xKSB7XG4gICAgT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMob2JqZWN0LmNvbnN0cnVjdG9yKS5mb3JFYWNoKChwcm9wZXJ0eSkgPT4ge1xuICAgICAgaWYgKHZpc2l0ZWRbcHJvcGVydHldKSByZXR1cm47XG4gICAgICB2aXNpdGVkW3Byb3BlcnR5XSA9IHRydWU7XG5cbiAgICAgIGNvbnN0IHZhbHVlID0gb2JqZWN0LmNvbnN0cnVjdG9yW3Byb3BlcnR5XTtcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT09ICdmdW5jdGlvbicgfHwgcHJvcGVydHkgPT09ICdwcm90b3R5cGUnKSByZXR1cm47XG4gICAgICBpdGVyYXRlZSh2YWx1ZSwgcHJvcGVydHkpO1xuICAgIH0pO1xuICB9XG5cbiAgZm9yRWFjaE93bkFuZEluaGVyaXRlZEZ1bmN0aW9uKE9iamVjdC5nZXRQcm90b3R5cGVPZihvYmplY3QpLCBpdGVyYXRlZSwgdmlzaXRlZCk7XG59XG5cbi8qKlxuICogQSBxdWV1ZSB0aGF0IHJ1bnMgb25seSBgbWF4Q29uY3VycmVuY3lgIGZ1bmN0aW9ucyBhdCBhIHRpbWUsIHRoYXRcbiAqIGNhbiBhbHNvIG9wZXJhdGUgYXMgYSBzdGFjay4gSXRlbXMgaW4gdGhlIHF1ZXVlIGFyZSBkZXF1ZXVlZCBvbmNlXG4gKiBwcmV2aW91cyBmdW5jdGlvbnMgaGF2ZSBmdWxseSByZXNvbHZlZC5cbiAqIEBjbGFzcyBQcm9taXNlUXVldWVcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBjbGFzcyBQcm9taXNlUXVldWUge1xuICAvKipcbiAgICogV29ya3MgbGlrZSBCbHVlYmlyZCdzIFByb21pc2UucHJvbWlzaWZ5LlxuICAgKiBHaXZlbiBhIGZ1bmN0aW9uLCB0aGlzIHdpbGwgcmV0dXJuIGEgd3JhcHBlciBmdW5jdGlvbiB0aGF0IGVucXVldWUncyBhIGNhbGxcbiAgICogdG8gdGhlIGZ1bmN0aW9uIHVzaW5nIGVpdGhlciB0aGUgcHJvdmlkZWQgUHJvbWlzZVF1ZXVlIGlzbnRhbmNlIG9yIGEgbmV3IG9uZS5cbiAgICogQHBhcmFtIHtmdW5jdGlvbn0gbWV0aG9kIFRoZSBtZXRob2QgdG8gcXVldWVpZnkuXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zIFF1ZXVlaWZpY2F0aW9uIG9wdGlvbnMuXG4gICAqIEBwYXJhbSB7UHJvbWlzZVF1ZXVlPX0gb3B0aW9ucy5xdWV1ZSBUaGUgcXVldWUgdGhlIHdyYXBwZXIgZnVuY3Rpb24gd2lsbCBvcGVyYXRlIHVzaW5nLlxuICAgKiBAcGFyYW0ge2FueX0gb3B0aW9ucy5jb250ZXh0IFRoZSB2YWx1ZSBmb3IgYHRoaXNgIGluIHRoZSBxdWV1ZWlmaWVkIGZ1bmN0aW9uLlxuICAgKiBAcmV0dXJucyB7ZnVuY3Rpb259IFRoZSBxdWV1ZWlmaWVkIHZlcnNpb24gb2YgdGhlIGZ1bmN0aW9uLlxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqIEBzdGF0aWNcbiAgICovXG4gIHN0YXRpYyBxdWV1ZWlmeShtZXRob2QsIG9wdGlvbnMgPSB7fSkge1xuICAgIGNvbnN0IHtcbiAgICAgIHF1ZXVlID0gbmV3IFByb21pc2VRdWV1ZShvcHRpb25zKSxcbiAgICAgIGNvbnRleHQgPSBxdWV1ZSxcbiAgICAgIHByaW9yaXR5ID0gMCxcbiAgICB9ID0gb3B0aW9ucztcblxuICAgIGlmICh0eXBlb2YgbWV0aG9kICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgICAnWW91IG11c3QgcGFzcyBhIGZ1bmN0aW9uIGZvciBwYXJhbWV0ZXIgXCJtZXRob2RcIiB0byBxdWV1ZWlmeS4nLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAoIShxdWV1ZSBpbnN0YW5jZW9mIFByb21pc2VRdWV1ZSkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXG4gICAgICAgICdQcm9taXNlUXVldWUucXVldWVpZnkgZXhwZWN0ZWQgYW4gaW5zdGFuY2Ugb2YgUHJvbWlzZVF1ZXVlIGZvciBwYXJhbWV0ZXIgXCJxdWV1ZVwiLicsXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHF1ZXVlaWZpZWQgPSAoLi4uYXJncykgPT4gcXVldWUuZW5xdWV1ZShtZXRob2QsIHsgYXJncywgY29udGV4dCwgcHJpb3JpdHkgfSk7XG4gICAgcXVldWVpZmllZC5xdWV1ZSA9IHF1ZXVlO1xuXG4gICAgcmV0dXJuIHF1ZXVlaWZpZWQ7XG4gIH1cblxuICAvKipcbiAgICogV29ya3MgbGlrZSBCbHVlYmlyZCdzIFByb21pc2UucHJvbWlzaWZ5QWxsLlxuICAgKiBHaXZlbiBhbiBvYmplY3QsIHRoaXMgbWV0aG9kIHdpbGwgY3JlYXRlIGEgbmV3IFwicXVldWVkXCIgdmVyc2lvbiBvZiBlYWNoIGZ1bmN0aW9uXG4gICAqIG9uIHRoZSBvYmplY3QgYW5kIGFzc2lnbiBpdCB0byB0aGUgb2JqZWN0IGFzIFtwcmVmaXhdW21ldGhvZCBuYW1lXVtzdWZmaXhdIChjYW1lbCBjYXNlZCkuXG4gICAqIEFsbCBjYWxscyB0byB0aGUgcXVldWVkIHZlcnNpb24gd2lsbCB1c2UgUHJvbWlzZVF1ZXVlI2VucXVldWUuXG4gICAqICpOb3RlKiBUaGlzIHdpbGwgbXV0YXRlIHRoZSBwYXNzZWQgaW4gb2JqZWN0LlxuICAgKiBAcGFyYW0ge29iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gY3JlYXRlIG5ldyBxdWVpZmllZCBmdW5jdGlvbnMgb24uXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zIFF1ZWlmaWNhdGlvbiBvcHRpb25zLlxuICAgKiBAcGFyYW0ge3N0cmluZz19IG9wdGlvbnMucHJlZml4IEEgcHJlZml4IHByZXBlbmRlZCB0byBxdWV1ZWlmaWVkIGZ1bmN0aW9uIHByb3BlcnR5IG5hbWVzLlxuICAgKiBAcGFyYW0ge3N0cmluZz19IG9wdGlvbnMuc3VmZml4IEEgc3VmZml4IGFwcGVuZGVkIHRvIHF1ZXVlaWZpZWQgZnVuY3Rpb24gcHJvcGVydHkgbmFtZXMuXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zLnByaW9yaXRpZXMgQSBtYXBwaW5nIG9mIHRoZSAqb3JpZ2luYWwqIGZ1bmN0aW9uIG5hbWVzIHRvXG4gICAqIHF1ZXVlIHByaW9yaXRpZXMuXG4gICAqIEBwYXJhbSB7UHJvbWlzZVF1ZXVlPX0gb3B0aW9ucy5xdWV1ZSBUaGUgUHJvbWlzZVF1ZXVlIGluc3RhbmNlIGZvciBlYWNoIGZ1bmN0aW9uXG4gICAqIHRvIG9wZXJhdGUgdXNpbmcuXG4gICAqIEBwYXJhbSB7c3RyaW5nPX0gYXNzaWduUXVldWVBc1Byb3BlcnR5IFRoZSBwcm9wZXJ0eSBuYW1lIHRvIGFzc2lnbiB0aGUgUHJvbWlzZVF1ZXVlIGluc3RhbmNlXG4gICAqIG9uIHRoZSBvYmplY3QgYXMuIFNldCB0aGlzIHRvIGEgZmFsc3kgdmFsdWUgdG8gb21pdCBhZGRpbmcgYSByZWZlcmVuY2UgdG8gdGhlIHF1ZXVlLlxuICAgKiBAcmV0dXJucyB7b2JqZWN0fSBUaGUgb3JpZ2luYWxseSBwYXNzZWQgaW4gb2JqZWN0IHdpdGggbmV3IHF1ZXVlaWZpZWQgZnVuY3Rpb25zIGF0dGFjaGVkLlxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqIEBzdGF0aWNcbiAgICovXG4gIHN0YXRpYyBxdWV1ZWlmeUFsbChvYmplY3QsIG9wdGlvbnMgPSB7fSkge1xuICAgIGNvbnN0IHtcbiAgICAgIHByZWZpeCA9ICdxdWV1ZWQnLFxuICAgICAgc3VmZml4ID0gJycsXG4gICAgICBwcmlvcml0aWVzID0ge30sXG4gICAgICBxdWV1ZSA9IG5ldyBQcm9taXNlUXVldWUob3B0aW9ucyksXG4gICAgICBhc3NpZ25RdWV1ZUFzUHJvcGVydHkgPSAncXVldWUnLFxuICAgIH0gPSBvcHRpb25zO1xuXG4gICAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8ICFPYmplY3QuaXNFeHRlbnNpYmxlKG9iamVjdCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IHF1ZXVlaWZ5IGEgbm9uLW9iamVjdCBvciBub24tZXh0ZW5zaWJsZSBvYmplY3QuJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdGFyZ2V0ID0gb2JqZWN0O1xuICAgIGNvbnN0IGZ1bmN0aW9ucyA9IFtdO1xuXG4gICAgLy8gSXRlcmF0ZSBvdmVyIGFsbCBvZiB0aGUgb2JqZWN0J3Mgb3duIGFuZCBpbmhlcml0ZWQgZnVuY3Rpb25zIGFuZCBxdWV1ZWlmeSBlYWNoIG1ldGhvZC5cbiAgICAvLyBUaGlzIHdpbGwgYWRkIGEgbmV3IHByb3Blcnkgb24gdGhlIG9iamVjdCBbcHJlZml4XVttZXRob2QgbmFtZV1bc3VmZml4XS5cbiAgICBmb3JFYWNoT3duQW5kSW5oZXJpdGVkRnVuY3Rpb24odGFyZ2V0LFxuICAgICAgKHZhbHVlLCBwcm9wZXJ0eSkgPT4gZnVuY3Rpb25zLnB1c2goeyB2YWx1ZSwgcHJvcGVydHkgfSksXG4gICAgKTtcblxuICAgIGZ1bmN0aW9ucy5mb3JFYWNoKCh7IHZhbHVlLCBwcm9wZXJ0eSB9KSA9PiB7XG4gICAgICB0YXJnZXRba2V5Rm9yUXVldWVpZmllZE1ldGhvZChwcm9wZXJ0eSwgcHJlZml4LCBzdWZmaXgpXSA9IFByb21pc2VRdWV1ZS5xdWV1ZWlmeSh2YWx1ZSwge1xuICAgICAgICBxdWV1ZSxcbiAgICAgICAgY29udGV4dDogdGFyZ2V0LFxuICAgICAgICBwcmlvcml0eTogTnVtYmVyKHByaW9yaXRpZXNbcHJvcGVydHldKSB8fCAwLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBTdG9yZSBvZmYgYSByZWZlcmVuY2UgdG8gdGhlIG9iamVjdCdzIHF1ZXVlIGZvciB1c2VyIHVzZS5cbiAgICAvLyBUaGlzIGNhbiBiZSBkaXNhYmxlZCBieSBzZXR0aW5nIGBhc3NpZ25RdWV1ZUFzUHJvcGVydHlgIHRvIGZhbHNlLlxuICAgIGlmICh0eXBlb2YgYXNzaWduUXVldWVBc1Byb3BlcnR5ID09PSAnc3RyaW5nJykgdGFyZ2V0W2Fzc2lnblF1ZXVlQXNQcm9wZXJ0eV0gPSBxdWV1ZTtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYW4gaW5zdGFuY2Ugb2YgUHJvbWlzZVF1ZXVlLlxuICAgKiBAcGFyYW0ge29iamVjdH0gb3B0aW9ucyBQcm9taXNlUXVldWUgaW5zdGFuY2Ugb3B0aW9ucy5cbiAgICogQHBhcmFtIHtib29sZWFuPX0gb3B0aW9ucy5saWZvIElmIHRydWUsIHRoZSBpbnN0YW5jZSB3aWxsIG9wZXJhdGUgYXMgYSBzdGFja1xuICAgKiByYXRoZXIgdGhhbiBhIHF1ZXVlICh1c2luZyAucG9wIGluc3RlYWQgb2YgLnNoaWZ0KS5cbiAgICogQHBhcmFtIHtudW1iZXJ9IG9wdGlvbnMubWF4Q29uY3VycmVuY3kgVGhlIG1heGltdW0gbnVtYmVyIG9mIHF1ZXVlIG1ldGhvZHMgdGhhdCBjYW5cbiAgICogcnVuIGNvbmN1cnJlbnRseS4gRGVmYXVsdHMgdG8gMSBhbmQgaXMgY2xhcGVkIHRvIFsxLCBJbmZpbmlmeV0uXG4gICAqL1xuICBjb25zdHJ1Y3Rvcih7XG4gICAgbGlmbyA9IGZhbHNlLFxuICAgIG9uUXVldWVEcmFpbmVkLFxuICAgIG9uTWV0aG9kRW5xdWV1ZWQsXG4gICAgbWF4Q29uY3VycmVuY3kgPSAxLFxuICAgIGhhbmRsZVF1ZXVlUmVkdWN0aW9uLFxuICAgIG9uTWV0aG9kRGVwcmlvcml0aXplZCxcbiAgfSA9IHt9KSB7XG4gICAgdGhpcy5xdWV1ZSA9IFtdO1xuICAgIHRoaXMucnVubmluZyA9IDA7XG4gICAgdGhpcy5saWZvID0gQm9vbGVhbihsaWZvKTtcblxuICAgIHRoaXMuaXNEcmFpbmVkID0gZmFsc2U7XG4gICAgdGhpcy5pc1BhdXNlZCA9IGZhbHNlO1xuXG4gICAgdGhpcy5oYW5kbGVRdWV1ZVJlZHVjdGlvbiA9IGhhbmRsZVF1ZXVlUmVkdWN0aW9uO1xuICAgIHRoaXMub25NZXRob2REZXByaW9yaXRpemVkID0gb25NZXRob2REZXByaW9yaXRpemVkO1xuXG4gICAgdGhpcy5vblF1ZXVlRHJhaW5lZCA9IG9uUXVldWVEcmFpbmVkO1xuICAgIHRoaXMub25NZXRob2RFbnF1ZXVlZCA9IG9uTWV0aG9kRW5xdWV1ZWQ7XG4gICAgdGhpcy5zZXRNYXhDb25jdXJyZW5jeShtYXhDb25jdXJyZW5jeSk7XG5cbiAgICAvLyBBbiBvcHRpbWl6YXRpb24gdG8gcHJldmVudCBzb3J0aW5nIHRoZSBxdWV1ZSBvbiBldmVyeSBlbnF1ZXVlXG4gICAgLy8gdW50aWwgYSBwcmlvcml0eSBoYXMgYmVlbiBzZXQgb24gYSBtZXRob2QuXG4gICAgdGhpcy5wcmlvcml0eVNvcnRNb2RlID0gZmFsc2U7XG4gIH1cblxuICAvKipcbiAgICogQHJldHVybnMge251bWJlcn0gVGhlIG51bWJlciBvZiBlbnF1ZXVlZCBpdGVtcy5cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKiBAcmVhZG9ubHlcbiAgICovXG4gIGdldCBzaXplKCkge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlLmxlbmd0aDtcbiAgfVxuXG4gIC8qKlxuICAgKiBBbiBhbGlhcyBmb3IgXCJlbnF1ZXVlXCIuXG4gICAqIElmIGluIGxpZm8gbW9kZSB0aGlzIHZlcmIgbWlnaHQgYmUgbW9yZSBjb3JyZWN0LlxuICAgKiBAcmVhZG9ubHlcbiAgICovXG4gIGdldCBwdXNoKCkge1xuICAgIHJldHVybiB0aGlzLmVucXVldWU7XG4gIH1cblxuICAvKipcbiAgICogU2V0cyB0aGUgcXVldWUncyBtYXhpbXVtIGNvbmN1cnJlbmN5LlxuICAgKiBAcGFyYW0ge251bWJlcn0gbWF4Q29uY3VycmVuY3kgVGhlIGNvbmN1cnJlbnQgdmFsdWUgdG8gc2V0LlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZVF1ZXVlfSBUaGUgY3VycmVudCBQcm9taXNlUXVldWUgaW5zdGFuY2UgZm9yIGNoYWluaW5nLlxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqL1xuICBzZXRNYXhDb25jdXJyZW5jeShtYXhDb25jdXJyZW5jeSkge1xuICAgIHRoaXMubWF4Q29uY3VycmVuY3kgPSBNYXRoLm1heChOdW1iZXIobWF4Q29uY3VycmVuY3kpIHx8IDEsIDEpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIENhbGxlZCB3aGVuIGEgdGFzayBoYXMgc3RhcnRlZCBwcm9jZXNzaW5nLlxuICAgKiBAcmV0dXJucyB7dW5kZWZpbmVkfVxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqL1xuICBvbk1ldGhvZFN0YXJ0ZWQoKSB7XG4gICAgdGhpcy5ydW5uaW5nKys7XG4gIH1cblxuICAvKipcbiAgICogQ2FsbGVkIHdoZW4gYSB0YXNrIGhhcyBmaW5pc2hlZCBwcm9jZXNzaW5nLiBUaGlzIGlzIGNhbGxlZCByZWdhcmRsZXNzXG4gICAqIG9mIHdoZXRoZXIgb3Igbm90IHRoZSB1c2VyJ3MgcXVldWVkIG1ldGhvZCBzdWNjZWVkcyBvciB0aHJvd3MuXG4gICAqIEBwYXJhbSB7ZnVuY3Rpb259IHJlc29sdmVycyBUaGUgcnVubmluZyBtZXRob2QncyByZXNvbHZlL3JlamVjdCBmdW5jdGlvbnMuXG4gICAqIEBwYXJhbSB7YW55fSByZXN1bHQgVGhlIHJlc3VsdCB5aWVsZGVkIGZyb20gdGhlIG1ldGhvZCdzIGludm9jYXRpb24uXG4gICAqIEByZXR1cm5zIHt1bmRlZmluZWR9XG4gICAqIEBtZW1iZXJvZiBQcm9taXNlUXVldWVcbiAgICovXG4gIG9uTWV0aG9kQ29tcGxldGVkKHJlc29sdmVycywgcmVzdWx0KSB7XG4gICAgdGhpcy5ydW5uaW5nLS07XG4gICAgaW52b2tlQWxsV2l0aEFyZ3VtZW50cyhyZXNvbHZlcnMsIFtyZXN1bHRdKTtcbiAgICB0aGlzLnRpY2soKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBcIlRpY2tzXCIgdGhlIHF1ZXVlLiBUaGlzIHdpbGwgc3RhcnQgcHJvY2VzcyB0aGUgbmV4dCBpdGVtIGluIHRoZSBxdWV1ZVxuICAgKiBpZiB0aGUgcXVldWUgaXMgaWRsZSBvciBoYXNuJ3QgcmVhY2hlZCB0aGUgcXVldWUncyBgbWF4Q29uY3VycmVuY3lgLlxuICAgKiBAcmV0dXJucyB7dW5kZWZpbmVkfVxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqL1xuICB0aWNrKCkge1xuICAgIC8vIE5vdGhpbmcgbGVmdCB0byBwcm9jZXNzIGluIHRoZSBxdWV1ZVxuICAgIGlmICghdGhpcy5xdWV1ZS5sZW5ndGgpIHtcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5vblF1ZXVlRHJhaW5lZCA9PT0gJ2Z1bmN0aW9uJyAmJiAhdGhpcy5pc0RyYWluZWQpIHRoaXMub25RdWV1ZURyYWluZWQoKTtcbiAgICAgIHRoaXMuaXNEcmFpbmVkID0gdHJ1ZTtcbiAgICAgIHRoaXMucHJpb3JpdHlTb3J0TW9kZSA9IGZhbHNlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFRvbyBtYW55IHJ1bm5pbmcgdGFza3Mgb3IgdGhlIHF1ZXVlIGlzIHBhdXNlZC5cbiAgICBpZiAodGhpcy5ydW5uaW5nID49IHRoaXMubWF4Q29uY3VycmVuY3kgfHwgdGhpcy5pc1BhdXNlZCkgcmV0dXJuO1xuICAgIHRoaXMub25NZXRob2RTdGFydGVkKCk7XG5cbiAgICAvLyBQcm9jZXNzIHRoZSBuZXh0IHRhc2sgaW4gdGhlIHF1ZXVlLlxuICAgIC8vIFRoaXMgd2lsbCBpbmNyZW1lbnQgdGhlIG51bWJlciBvZiBcImNvbmN1cnJlbnRseSBydW5uaW5nIG1ldGhvZHNcIixcbiAgICAvLyBydW4gdGhlIG1ldGhvZCwgYW5kIHRoZW4gZGVjcmVtZW50IHRoZSBydW5uaW5nIG1ldGhvZHMuXG4gICAgY29uc3Qge1xuICAgICAgYXJncyxcbiAgICAgIG1ldGhvZCxcbiAgICAgIGNvbnRleHQsXG4gICAgICByZXNvbHZlcnMsXG4gICAgICByZWplY3RvcnMsXG4gICAgfSA9IHRoaXMucXVldWVbdGhpcy5saWZvID8gJ3BvcCcgOiAnc2hpZnQnXSgpO1xuXG4gICAgLy8gV2UgbXVzdCBjYWxsIHRoZSBmdW5jdGlvbiBpbWVkaWF0ZWx5IHNpbmNlIHdlJ3ZlIGFscmVhZHlcbiAgICAvLyBkZWZlcnJlZCBpbnZvY2F0aW9uIG9uY2UgKGluIGBlbnF1ZXVlYCkuIE90aGVyd2lzZSwgd2Ugd2lsbFxuICAgIC8vIGdldCBhIHN0cmFuZ2Ugb3JkZXIgb2YgZXhlY3V0aW9uLlxuICAgIGxldCByZXR1cm5lZDtcblxuICAgIHRyeSB7XG4gICAgICByZXR1cm5lZCA9IG1ldGhvZC5jYWxsKGNvbnRleHQsIC4uLmFyZ3MpO1xuXG4gICAgICBpZiAocmV0dXJuZWQgJiYgcmV0dXJuZWRbSVNfUFJPTUlTRV9RVUVVRV9QUk9NSVNFXSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgJ1F1ZXVlIG91dCBvZiBvcmRlciBleGVjdXRpb246IGNhbm5vdCByZXNvbHZlIHdpdGggc29tZXRoaW5nIHRoYXQgJyArXG4gICAgICAgICAgXCJ3b24ndCBiZSBjYWxsZWQgdW50aWwgdGhpcyBmdW5jdGlvbiBjb21wbGV0ZXMuXCIsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhpcy5vbk1ldGhvZENvbXBsZXRlZChyZWplY3RvcnMsIGUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIFByb21pc2UucmVzb2x2ZShyZXR1cm5lZClcbiAgICAgIC5jYXRjaChlID0+IHRoaXMub25NZXRob2RDb21wbGV0ZWQocmVqZWN0b3JzLCBlKSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gdGhpcy5vbk1ldGhvZENvbXBsZXRlZChyZXNvbHZlcnMsIHJlc3VsdHMpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTb3J0cyB0aGUgcXVldWUgYmFzZWQgb24gcHJpb3JpdGllcy5cbiAgICogQHJldHVybnMge3VuZGVmaW5lZH1cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgcHJpb3JpdGl6ZVF1ZXVlKCkge1xuICAgIGNvbnN0IGRlcHJpb3JpdGl6ZWQgPSBbXTtcbiAgICBjb25zdCBzb3J0ZXIgPSB0aGlzLmxpZm8gPyBwcmlvcml0eVNvcnRMSUZPIDogcHJpb3JpdHlTb3J0RklGTztcbiAgICB0aGlzLnF1ZXVlLnNvcnQoc29ydGVyKGRlcHJpb3JpdGl6ZWQpKTtcblxuICAgIGlmICh0eXBlb2YgdGhpcy5vbk1ldGhvZERlcHJpb3JpdGl6ZWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGRlcHJpb3JpdGl6ZWQuZm9yRWFjaCgoZW5xdWV1ZWQpID0+IHtcbiAgICAgICAgY29uc3QgcHJpbyA9IE51bWJlcih0aGlzLm9uTWV0aG9kRGVwcmlvcml0aXplZChwaWNrKGVucXVldWVkLCBQSUNLX0ZST01fRU5RVUVVRUQpKSkgfHwgMDtcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXBhcmFtLXJlYXNzaWduXG4gICAgICAgIGVucXVldWVkLnByaW9yaXR5ID0gcHJpbztcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDYWxscyB0aGUgYGhhbmRsZVF1ZXVlUmVkdWN0aW9uYCBvbiBlYWNoIGl0ZW0gaW4gdGhlIHF1ZXVlLCBhbGxvd2luZyB1c2Vyc1xuICAgKiB0byBcImNvbWJpbmVcIiBzaW1pbGFyIHF1ZXVlZCBtZXRob2RzIGludG8gYSBzaW5nbGUgY2FsbC5cbiAgICogQHJldHVybnMge3VuZGVmaW5lZH1cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgcmVkdWNlUXVldWUoKSB7XG4gICAgaWYgKHR5cGVvZiB0aGlzLmhhbmRsZVF1ZXVlUmVkdWN0aW9uICE9PSAnZnVuY3Rpb24nKSByZXR1cm47XG4gICAgdGhpcy5xdWV1ZSA9IHRoaXMucXVldWUucmVkdWNlKG9uUXVldWVJdGVtUmVkdWN0aW9uKHRoaXMuaGFuZGxlUXVldWVSZWR1Y3Rpb24pLCBbXSk7XG4gIH1cblxuICAvKipcbiAgICogQWRkcyBhIG1ldGhvZCBpbnRvIHRoZSBQcm9taXNlUXVldWUgZm9yIGRlZmVycmVkIGV4ZWN1dGlvbi5cbiAgICogQHBhcmFtIHtmdW5jdGlvbn0gbWV0aG9kIFRoZSBmdW5jdGlvbiB0byBlbnF1ZXVlLlxuICAgKiBAcGFyYW0ge29iamVjdH0gb3B0aW9ucyBNZXRob2Qgc3BlY2lmaWMgZW5xdWV1ZWluZyBvcHRpb25zLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUmVzb2x2ZXMgb25jZSB0aGUgcGFzc2VkIGluIG1ldGhvZCBpcyBkZXF1ZXVlZCBhbmQgZXhlY3V0ZWQgdG8gY29tcGxldGlvbi5cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgZW5xdWV1ZShtZXRob2QsIG9wdGlvbnMgPSB7fSkge1xuICAgIGNvbnN0IGVucXVldWVkTWV0aG9kUHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IHsgYXJncyA9IFtdLCBwcmlvcml0eSA9IDAsIGNvbnRleHQgPSB0aGlzIH0gPSBvcHRpb25zO1xuXG4gICAgICBpZiAodHlwZW9mIG1ldGhvZCAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICByZXR1cm4gcmVqZWN0KG5ldyBUeXBlRXJyb3IoXG4gICAgICAgICAgJ1Byb21pc2VRdWV1ZSNlbnF1ZXVlIGV4cGVjdGVkIGEgZnVuY3Rpb24gZm9yIGFyZ3VtZW50IFwibWV0aG9kXCIuJyxcbiAgICAgICAgKSk7XG4gICAgICB9XG5cbiAgICAgIGlmICghKGFyZ3MgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgcmV0dXJuIHJlamVjdChuZXcgVHlwZUVycm9yKFxuICAgICAgICAgICdQcm9taXNlUXVldWUjZW5xdWV1ZSBleHBlY3RlZCBhbiBhcnJheSBmb3IgYXJndW1lbnQgXCJvcHRpb25zLmFyZ3NcIi4nLFxuICAgICAgICApKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5xdWV1ZS5wdXNoKHtcbiAgICAgICAgYXJncyxcbiAgICAgICAgbWV0aG9kLFxuICAgICAgICBjb250ZXh0LFxuICAgICAgICBwcmlvcml0eTogTnVtYmVyKHByaW9yaXR5KSB8fCAwLFxuICAgICAgICByZWplY3RvcnM6IFtyZWplY3RdLFxuICAgICAgICByZXNvbHZlcnM6IFtyZXNvbHZlXSxcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLmlzRHJhaW5lZCA9IGZhbHNlO1xuXG4gICAgICAvLyBUb2dnbGVzIHRoZSBxdWV1ZSBmcm9tIHVuLXNvcnRlZCBtb2RlIHRvIHByaW9yaXR5IHNvcnQgbW9kZS5cbiAgICAgIGlmIChOdW1iZXIocHJpb3JpdHkpICE9PSAwKSB0aGlzLnByaW9yaXR5U29ydE1vZGUgPSB0cnVlO1xuXG4gICAgICAvLyBGaXJzdCBwcmlvcml0aXplIHRoZSBxdWV1ZSAoc29ydCBpdCBieSBwcmlvcml0aWVzKSxcbiAgICAgIC8vIHRoZW4gYWxsb3cgdGhlIHVzZXIgdGhlIG9wcG9ydHVuaXR5IHRvIHJlZHVjZSBpdC5cbiAgICAgIGlmICh0aGlzLnByaW9yaXR5U29ydE1vZGUpIHRoaXMucHJpb3JpdGl6ZVF1ZXVlKCk7XG4gICAgICB0aGlzLnJlZHVjZVF1ZXVlKCk7XG5cbiAgICAgIGlmICh0eXBlb2YgdGhpcy5vbk1ldGhvZEVucXVldWVkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRoaXMub25NZXRob2RFbnF1ZXVlZChtZXRob2QsIG9wdGlvbnMpO1xuICAgICAgfVxuXG4gICAgICAvLyBEZWZlciB0aGUgZXhlY3V0aW9uIG9mIHRoZSB0aWNrIHVudGlsIHRoZSBuZXh0IGl0ZXJhdGlvbiBvZiB0aGUgZXZlbnQgbG9vcFxuICAgICAgLy8gVGhpcyBpcyBpbXBvcnRhbnQgc28gd2UgYWxsb3cgYWxsIHN5bmNocm9ub3VzIFwiZW5xdWV1ZXNcIiBvY2N1ciBiZWZvcmUgYW55XG4gICAgICAvLyBlbnF1ZXVlZCBtZXRob2RzIGFyZSBhY3R1YWxseSBpbnZva2VkLlxuICAgICAgUHJvbWlzZS5yZXNvbHZlKCkudGhlbigoKSA9PiB0aGlzLnRpY2soKSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH0pO1xuXG4gICAgZW5xdWV1ZWRNZXRob2RQcm9taXNlW0lTX1BST01JU0VfUVVFVUVfUFJPTUlTRV0gPSB0cnVlO1xuICAgIHJldHVybiBlbnF1ZXVlZE1ldGhvZFByb21pc2U7XG4gIH1cblxuICAvKipcbiAgICogQHJldHVybnMge0FycmF5PGZ1bmN0aW9uPn0gQSBzaGFsbG93IGNvcHkgb2YgdGhlIHF1ZXVlJ3MgZW5xdWV1ZWQgbWV0aG9kcy5cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgZ2V0RW5xdWV1ZWRNZXRob2RzKCkge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlLm1hcCgoeyBtZXRob2QgfSkgPT4gbWV0aG9kKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhcnMgYWxsIGVucXVldWVkIG1ldGhvZHMgZnJvbSB0aGUgcXVldWUuIEFueSBtZXRob2QgdGhhdCdzIGFscmVhZHlcbiAgICogYmVlbiBkZXF1ZXVlZCB3aWxsIHN0aWxsIHJ1biB0byBjb21wbGV0aW9uLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZVF1ZXVlfSBUaGUgY3VycmVudCBQcm9taXNlUXVldWUgaW5zdGFuY2UgZm9yIGNoYWluaW5nLlxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqL1xuICBjbGVhcigpIHtcbiAgICBjb25zdCB2YWx1ZXMgPSB0aGlzLnF1ZXVlLm1hcChnZXRFeHBvcnRhYmxlUXVldWVPYmplY3QpO1xuICAgIHRoaXMucXVldWUgPSBbXTtcbiAgICByZXR1cm4gdmFsdWVzO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYW4gZW5xdWV1ZWQgbWV0aG9kIGZyb20gdGhlIHF1ZXVlLiBJZiB0aGUgbWV0aG9kIHRvIHJlbW92ZVxuICAgKiBoYXMgYWxyZWFkeSBzdGFydGVkIHByb2Nlc3NpbmcsIGl0IHdpbGwgKm5vdCogYmUgcmVtb3ZlZC5cbiAgICogQHBhcmFtIHtmdW5jdGlvbn0gbWV0aG9kIFRoZSBtZXRob2QgdG8gcmVtb3ZlLlxuICAgKiBAcmV0dXJucyB7ZnVuY3Rpb258bnVsbH0gVGhlIHJlbW92ZWQgbWV0aG9kIGlmIGZvdW5kLCBgbnVsbGAgb3RoZXJ3aXNlLlxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqL1xuICByZW1vdmUobWV0aG9kKSB7XG4gICAgaWYgKHR5cGVvZiBtZXRob2QgIT09ICdmdW5jdGlvbicpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGluZGV4ID0gZmluZEluZGV4KHRoaXMucXVldWUsICh7IG1ldGhvZDogZW5xdWV1ZWQgfSkgPT4gZW5xdWV1ZWQgPT09IG1ldGhvZCk7XG4gICAgcmV0dXJuIGluZGV4ICE9PSAtMSA/IGdldEV4cG9ydGFibGVRdWV1ZU9iamVjdCh0aGlzLnF1ZXVlLnNwbGljZShpbmRleCwgMSlbMF0pIDogbnVsbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBQYXVzZXMgdGhlIHF1ZXVlLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZVF1ZXVlfSBUaGUgY3VycmVudCBQcm9taXNlUXVldWUgaW5zdGFuY2UgZm9yIGNoYWluaW5nLlxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqL1xuICBwYXVzZSgpIHtcbiAgICB0aGlzLmlzUGF1c2VkID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXN1bWVzIHRoZSBxdWV1ZS5cbiAgICogQHJldHVybnMge1Byb21pc2VRdWV1ZX0gVGhlIGN1cnJlbnQgUHJvbWlzZVF1ZXVlIGluc3RhbmNlIGZvciBjaGFpbmluZy5cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgcmVzdW1lKCkge1xuICAgIGlmICh0aGlzLmlzUGF1c2VkKSB7XG4gICAgICB0aGlzLmlzUGF1c2VkID0gZmFsc2U7XG4gICAgICB0aGlzLnRpY2soKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxufTtcbiJdfQ==
