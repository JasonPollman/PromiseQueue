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
      var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          _ref$queue = _ref.queue,
          queue = _ref$queue === undefined ? new PromiseQueue() : _ref$queue,
          _ref$context = _ref.context,
          context = _ref$context === undefined ? queue : _ref$context,
          _ref$priority = _ref.priority,
          priority = _ref$priority === undefined ? 0 : _ref$priority;

      if (typeof method !== 'function') {
        throw new TypeError('You must pass a function for parameter "method" to queueify.');
      }

      if (!(queue instanceof PromiseQueue)) {
        throw new TypeError('PromiseQueue.queueify expected an instance of PromiseQueue for parameter "queue".');
      }

      return function () {
        for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
          args[_key2] = arguments[_key2];
        }

        return queue.enqueue(method, { args: args, context: context, priority: priority });
      };
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
      var _ref2 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          _ref2$prefix = _ref2.prefix,
          prefix = _ref2$prefix === undefined ? 'queued' : _ref2$prefix,
          _ref2$suffix = _ref2.suffix,
          suffix = _ref2$suffix === undefined ? '' : _ref2$suffix,
          _ref2$priorities = _ref2.priorities,
          priorities = _ref2$priorities === undefined ? {} : _ref2$priorities,
          _ref2$queue = _ref2.queue,
          queue = _ref2$queue === undefined ? new PromiseQueue() : _ref2$queue,
          _ref2$assignQueueAsPr = _ref2.assignQueueAsProperty,
          assignQueueAsProperty = _ref2$assignQueueAsPr === undefined ? 'queue' : _ref2$assignQueueAsPr;

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

      functions.forEach(function (_ref3) {
        var value = _ref3.value,
            property = _ref3.property;

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
    var _ref4 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
        _ref4$lifo = _ref4.lifo,
        lifo = _ref4$lifo === undefined ? false : _ref4$lifo,
        onQueueDrained = _ref4.onQueueDrained,
        onMethodEnqueued = _ref4.onMethodEnqueued,
        _ref4$maxConcurrency = _ref4.maxConcurrency,
        maxConcurrency = _ref4$maxConcurrency === undefined ? 1 : _ref4$maxConcurrency,
        handleQueueReduction = _ref4.handleQueueReduction,
        onMethodDeprioritized = _ref4.onMethodDeprioritized;

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
            _options$priority = options.priority,
            priority = _options$priority === undefined ? 0 : _options$priority,
            _options$context = options.context,
            context = _options$context === undefined ? _this3 : _options$context;


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
      return this.queue.map(function (_ref5) {
        var method = _ref5.method;
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
      var index = findIndex(this.queue, function (_ref6) {
        var enqueued = _ref6.method;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9Qcm9taXNlUXVldWUuanMiXSwibmFtZXMiOlsiSVNfUFJPTUlTRV9RVUVVRV9QUk9NSVNFIiwiUElDS19GUk9NX0VOUVVFVUVEIiwiTkFUSVZFU19QUk9UT1RZUEVTIiwiT2JqZWN0IiwiZ2V0UHJvdG90eXBlT2YiLCJBcnJheSIsIlN0cmluZyIsIk51bWJlciIsIkJvb2xlYW4iLCJGdW5jdGlvbiIsIk5BVElWRVMiLCJjYXBpdGFsaXplIiwicyIsImNoYXJBdCIsInRvVXBwZXJDYXNlIiwic2xpY2UiLCJpbnZva2VBbGxXaXRoQXJndW1lbnRzIiwibWV0aG9kcyIsImFyZ3MiLCJmb3JFYWNoIiwibWV0aG9kIiwiaW52b2tlck9mQWxsV2l0aEFyZ3VtZW50cyIsInByaW9yaXR5U29ydEZJRk8iLCJhIiwiYiIsImRpZmZlcmVuY2UiLCJwcmlvcml0eSIsImRlcHJpb3JpdGl6ZWQiLCJpbmRleE9mIiwicHVzaCIsInByaW9yaXR5U29ydExJRk8iLCJmaW5kSW5kZXgiLCJjb2xsZWN0aW9uIiwiaXRlcmF0ZWUiLCJpbmRleCIsInNvbWUiLCJpdGVtIiwia2V5IiwicGljayIsInNvdXJjZSIsInByb3BlcnRpZXMiLCJyZXN1bHQiLCJwcm9wZXJ0eSIsImtleUZvclF1ZXVlaWZpZWRNZXRob2QiLCJtZXRob2ROYW1lIiwicHJlZml4Iiwic3VmZml4IiwiZ2V0RXhwb3J0YWJsZVF1ZXVlT2JqZWN0IiwiZGVxdWV1ZWQiLCJyZXNvbHZlIiwicmVzb2x2ZXJzIiwicmVqZWN0IiwicmVqZWN0b3JzIiwib25RdWV1ZUl0ZW1SZWR1Y3Rpb24iLCJoYW5kbGVRdWV1ZVJlZHVjdGlvbiIsInJlZHVjZWRRdWV1ZSIsImN1cnJlbnQiLCJxdWV1ZSIsInByZXZpb3VzIiwiZHJvcHBlZCIsImNvbWJpbmVkIiwiZHJvcCIsImNvbWJpbmUiLCJFcnJvciIsInByZXYiLCJjdXJyIiwiZm9yRWFjaE93bkFuZEluaGVyaXRlZEZ1bmN0aW9uIiwib2JqZWN0IiwiaGFuZGxlZCIsInZpc2l0ZWQiLCJnZXRPd25Qcm9wZXJ0eU5hbWVzIiwidmFsdWUiLCJjb25zdHJ1Y3RvciIsIm1vZHVsZSIsImV4cG9ydHMiLCJQcm9taXNlUXVldWUiLCJjb250ZXh0IiwiVHlwZUVycm9yIiwiZW5xdWV1ZSIsInByaW9yaXRpZXMiLCJhc3NpZ25RdWV1ZUFzUHJvcGVydHkiLCJpc0V4dGVuc2libGUiLCJ0YXJnZXQiLCJmdW5jdGlvbnMiLCJxdWV1ZWlmeSIsImxpZm8iLCJvblF1ZXVlRHJhaW5lZCIsIm9uTWV0aG9kRW5xdWV1ZWQiLCJtYXhDb25jdXJyZW5jeSIsIm9uTWV0aG9kRGVwcmlvcml0aXplZCIsInJ1bm5pbmciLCJpc0RyYWluZWQiLCJpc1BhdXNlZCIsInNldE1heENvbmN1cnJlbmN5IiwicHJpb3JpdHlTb3J0TW9kZSIsIk1hdGgiLCJtYXgiLCJ0aWNrIiwibGVuZ3RoIiwib25NZXRob2RTdGFydGVkIiwicmV0dXJuZWQiLCJjYWxsIiwiZSIsIm9uTWV0aG9kQ29tcGxldGVkIiwiUHJvbWlzZSIsImNhdGNoIiwidGhlbiIsInJlc3VsdHMiLCJzb3J0ZXIiLCJzb3J0IiwiZW5xdWV1ZWQiLCJwcmlvIiwicmVkdWNlIiwib3B0aW9ucyIsImVucXVldWVkTWV0aG9kUHJvbWlzZSIsInByaW9yaXRpemVRdWV1ZSIsInJlZHVjZVF1ZXVlIiwidW5kZWZpbmVkIiwibWFwIiwidmFsdWVzIiwic3BsaWNlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFBQTs7Ozs7Ozs7Ozs7OztBQWFBOzs7OztBQUtBLElBQU1BLDJCQUEyQiw4QkFBakM7O0FBRUE7Ozs7O0FBS0EsSUFBTUMscUJBQXFCLENBQUMsTUFBRCxFQUFTLFFBQVQsRUFBbUIsVUFBbkIsRUFBK0IsU0FBL0IsQ0FBM0I7O0FBRUE7Ozs7OztBQU1BLElBQU1DLHFCQUFxQixDQUN6QkMsT0FBT0MsY0FBUCxDQUFzQkQsTUFBdEIsQ0FEeUIsRUFFekJBLE9BQU9DLGNBQVAsQ0FBc0JDLEtBQXRCLENBRnlCLEVBR3pCRixPQUFP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LENBQWQ7QUFDQSxhQUFPYyxVQUFVLENBQUMsQ0FBWCxHQUFlYSx5QkFBeUIsS0FBS1UsS0FBTCxDQUFXK0QsTUFBWCxDQUFrQnRGLEtBQWxCLEVBQXlCLENBQXpCLEVBQTRCLENBQTVCLENBQXpCLENBQWYsR0FBMEUsSUFBakY7QUFDRDs7QUFFRDs7Ozs7O0FBNVZGO0FBQUE7QUFBQSw0QkFpV1U7QUFDTixXQUFLMEQsUUFBTCxHQUFnQixJQUFoQjtBQUNBLGFBQU8sSUFBUDtBQUNEOztBQUVEOzs7Ozs7QUF0V0Y7QUFBQTtBQUFBLDZCQTJXVztBQUNQLFVBQUksS0FBS0EsUUFBVCxFQUFtQjtBQUNqQixhQUFLQSxRQUFMLEdBQWdCLEtBQWhCO0FBQ0EsYUFBS0ssSUFBTDtBQUNEOztBQUVELGFBQU8sSUFBUDtBQUNEO0FBbFhIO0FBQUE7QUFBQSx3QkErSGE7QUFDVCxhQUFPLEtBQUt4QyxLQUFMLENBQVd5QyxNQUFsQjtBQUNEOztBQUVEOzs7Ozs7QUFuSUY7QUFBQTtBQUFBLHdCQXdJYTtBQUNULGFBQU8sS0FBS3BCLE9BQVo7QUFDRDtBQTFJSDs7QUFBQTtBQUFBIiwiZmlsZSI6IlByb21pc2VRdWV1ZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQSBoaWdobHkgZmxleGlibGUgcXVldWUgdGhhdCBydW5zIGBtYXhDb25jdXJyZW5jeWAgbWV0aG9kcyBhdCBhIHRpbWVcbiAqIGFuZCB3YWl0cyBmb3IgZWFjaCBtZXRob2QgdG8gcmVzb2x2ZSBiZWZvcmUgY2FsbGluZyB0aGUgbmV4dC5cbiAqXG4gKiBTdXBwb3J0IGZvciBxdWV1ZSBwYXVzaW5nLCBwcmlvcml0aXphdGlvbiwgcmVkdWN0aW9uIGFuZCBib3RoIEZJRk8gYW5kIExJRk8gbW9kZXMuXG4gKiBXb3JrcyBpbiBib3RoIGJyb3dzZXJzIGFuZCBub2RlLmpzLlxuICpcbiAqIFJlcXVpcmVtZW50czogUHJvbWlzZSBzdXBwb3J0L3BvbHlmaWxsXG4gKiBAYXV0aG9yIEphc29uIFBvbGxtYW4gPGphc29uanBvbGxtYW5AZ21haWwuY29tPlxuICogQHNpbmNlIDMvMTUvMThcbiAqIEBmaWxlXG4gKi9cblxuLyoqXG4gKiBBc3NpZ25lZCB0byBldmVyeSBwcm9taXNlIHJldHVybmVkIGZyb20gUHJvbWlzZVF1ZXVlI2VucXVldWVcbiAqIHRvIGVuc3VyZSB0aGUgdXNlciBpc24ndCByZXR1cm5pbmcgYW5vdGhlciBxbmV1ZXVlZCBwcm9taXNlLlxuICogQHR5cGUge3N0cmluZ31cbiAqL1xuY29uc3QgSVNfUFJPTUlTRV9RVUVVRV9QUk9NSVNFID0gJ19fSVNfUFJPTUlTRV9RVUVVRV9QUk9NSVNFX18nO1xuXG4vKipcbiAqIFRoZSBwcm9wZXJ0aWVzIHBpY2tlZCBmcm9tIGVhY2ggZW5xdWV1ZWQgaXRlbSB3aGVuXG4gKiBwYXNzZWQgdG8gdXNlciBtZXRob2RzIChmb3IgZW5jYXBzdWxhdGlvbiBhbmQgdG8gcHJldmVudCBtdXRhdGlvbikuXG4gKiBAdHlwZSB7QXJyYXk8c3RyaW5nPn1cbiAqL1xuY29uc3QgUElDS19GUk9NX0VOUVVFVUVEID0gWydhcmdzJywgJ21ldGhvZCcsICdwcmlvcml0eScsICdjb250ZXh0J107XG5cbi8qKlxuICogTmF0aXZlIHByb3RvdHlwZSBwcm9wZXJ0aWVzLlxuICogVGhpcyBpcyB0aGUgc2V0IG9mIHByb3RvdHlwZXMgd2hpY2ggd2UgZG9uJ3Qgd2FudCB0byBxdWV1ZWlmeSB3aGVuIHJ1bm5pbmdcbiAqIGBxdWV1ZWlmeUFsbGAgb24gYW4gb2JqZWN0IGFuZCB3YWxraW5nIGl0J3MgcHJvdG90eXBlIGNoYWluLlxuICogQHR5cGUge0FycmF5PG9iamVjdD59XG4gKi9cbmNvbnN0IE5BVElWRVNfUFJPVE9UWVBFUyA9IFtcbiAgT2JqZWN0LmdldFByb3RvdHlwZU9mKE9iamVjdCksXG4gIE9iamVjdC5nZXRQcm90b3R5cGVPZihBcnJheSksXG4gIE9iamVjdC5nZXRQcm90b3R5cGVPZihTdHJpbmcpLFxuICBPYmplY3QuZ2V0UHJvdG90eXBlT2YoTnVtYmVyKSxcbiAgT2JqZWN0LmdldFByb3RvdHlwZU9mKEJvb2xlYW4pLFxuICBPYmplY3QuZ2V0UHJvdG90eXBlT2YoRnVuY3Rpb24pLFxuXTtcblxuLyoqXG4gKiBUaGUgc2V0IG9mIG5hdGl2ZSBzdGF0aWMgcHJvcGVydGllcyB3ZSBkb24ndCB3YW50IHRvIHF1ZXVlaWZ5LlxuICogQHR5cGUge0FycmF5PGZ1bmN0aW9uPn1cbiAqL1xuY29uc3QgTkFUSVZFUyA9IFtcbiAgT2JqZWN0LFxuICBBcnJheSxcbiAgU3RyaW5nLFxuICBOdW1iZXIsXG4gIEJvb2xlYW4sXG4gIEZ1bmN0aW9uLFxuXTtcblxuLyoqXG4gKiBDYXBpdGFsaXplcyB0aGUgZmlyc3QgY2hhcmFjdGVyIG9mIGEgc3RyaW5nLlxuICogQHBhcmFtIHtzdHJpbmd9IHMgVGhlIHN0cmluZyB0byBjYXBpdGFsaXplLlxuICogQHJldHVybnMge3N0cmluZ30gVGhlIGNhcGl0YWxpemVkIHN0cmluZy5cbiAqL1xuY29uc3QgY2FwaXRhbGl6ZSA9IHMgPT4gcy5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHMuc2xpY2UoMSk7XG5cbi8qKlxuICogSW52b2tlcyB0aGUgZ2l2ZW4gYXJyYXkgb2YgZnVuY3Rpb25zIHdpdGggdGhlIGdpdmVuIGFycmF5IG9mIGFyZ3VtZW50cy5cbiAqIEBwYXJhbSB7QXJyYXk8ZnVuY3Rpb24+fSBtZXRob2RzIEFuIGFycmF5IG9mIG1ldGhvZHMgdG8gaW52b2tlLlxuICogQHBhcmFtIHtBcnJheX0gYXJncyBUaGUgYXJndW1lbnRzIHRvIGludm9rZSB0aGUgbWV0aG9kIHdpdGguXG4gKiBAcmV0dXJucyB7dW5kZWZpbmVkfVxuICovXG5jb25zdCBpbnZva2VBbGxXaXRoQXJndW1lbnRzID0gKG1ldGhvZHMsIGFyZ3MpID0+IG1ldGhvZHMuZm9yRWFjaChtZXRob2QgPT4gbWV0aG9kKC4uLmFyZ3MpKTtcblxuLyoqXG4gKiBDdXJyaWVkIHZlcnNpb24gb2YgYGludm9rZUFsbFdpdGhBcmd1bWVudHNgLlxuICogQHBhcmFtIHtBcnJheTxmdW5jdGlvbj59IG1ldGhvZHMgQW4gYXJyYXkgb2YgbWV0aG9kcyB0byBpbnZva2UuXG4gKiBAcmV0dXJucyB7dW5kZWZpbmVkfVxuICovXG5jb25zdCBpbnZva2VyT2ZBbGxXaXRoQXJndW1lbnRzID0gbWV0aG9kcyA9PiAoLi4uYXJncykgPT4gaW52b2tlQWxsV2l0aEFyZ3VtZW50cyhtZXRob2RzLCBhcmdzKTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgZnVuY3Rpb24gdXNlZCBieSBBcnJheSNzb3J0IHRvIHNvcnQgcXVldWVzIGJ5IHByaW9yaXR5IGluIGZpZm8gbW9kZS5cbiAqIEBwYXJhbSB7QXJyYXl9IGRlcHJpb3JpdGl6ZWQgQ29sbGVjdHMgZGVwcmlvcml0aXplZCBlbnF1ZXVlZCBpdGVtcy5cbiAqIEByZXR1cm5zIHtudW1iZXJ9IEEgc29ydCByZXN1bHQgdmFsdWUuXG4gKi9cbmNvbnN0IHByaW9yaXR5U29ydEZJRk8gPSBkZXByaW9yaXRpemVkID0+IChhLCBiKSA9PiB7XG4gIGNvbnN0IGRpZmZlcmVuY2UgPSBOdW1iZXIoYi5wcmlvcml0eSkgLSBOdW1iZXIoYS5wcmlvcml0eSk7XG4gIGlmIChkaWZmZXJlbmNlID4gMCAmJiBkZXByaW9yaXRpemVkLmluZGV4T2YoYSkgPT09IC0xKSBkZXByaW9yaXRpemVkLnB1c2goYSk7XG4gIHJldHVybiBkaWZmZXJlbmNlO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgZnVuY3Rpb24gdXNlZCBieSBBcnJheSNzb3J0IHRvIHNvcnQgcXVldWVzIGJ5IHByaW9yaXR5IGluIGxpZm8gbW9kZS5cbiAqIEBwYXJhbSB7QXJyYXl9IGRlcHJpb3JpdGl6ZWQgQ29sbGVjdHMgZGVwcmlvcml0aXplZCBlbnF1ZXVlZCBpdGVtcy5cbiAqIEByZXR1cm5zIHtudW1iZXJ9IEEgc29ydCByZXN1bHQgdmFsdWUuXG4gKi9cbmNvbnN0IHByaW9yaXR5U29ydExJRk8gPSBkZXByaW9yaXRpemVkID0+IChhLCBiKSA9PiB7XG4gIGNvbnN0IGRpZmZlcmVuY2UgPSBOdW1iZXIoYS5wcmlvcml0eSkgLSBOdW1iZXIoYi5wcmlvcml0eSk7XG4gIGlmIChkaWZmZXJlbmNlIDwgMCAmJiBkZXByaW9yaXRpemVkLmluZGV4T2YoYSkgPT09IC0xKSBkZXByaW9yaXRpemVkLnB1c2goYSk7XG4gIHJldHVybiBkaWZmZXJlbmNlO1xufTtcblxuLyoqXG4gKiBTaW1pbGFyIHRvIEFycmF5I2ZpbmRJbmRleCAod2hpY2ggaXMgdW5zdXBwb3J0ZWQgYnkgSUUpLlxuICogQHBhcmFtIHtBcnJheX0gY29sbGVjdGlvbiBUaGUgY29sbGVjdGlvbiB0byBmaW5kIGFuIGluZGV4IHdpdGhpbi5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGl0ZXJhdGVlIFRoZSBmdW5jdGlvbiB0byBpbnZva2UgZm9yIGVhY2ggaXRlbS5cbiAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBpbmRleCBvZiB0aGUgZm91bmQgaXRlbSwgb3IgLTEuXG4gKi9cbmZ1bmN0aW9uIGZpbmRJbmRleChjb2xsZWN0aW9uLCBpdGVyYXRlZSkge1xuICBsZXQgaW5kZXggPSAtMTtcblxuICBjb2xsZWN0aW9uLnNvbWUoKGl0ZW0sIGtleSkgPT4ge1xuICAgIGlmICghaXRlcmF0ZWUoaXRlbSwga2V5LCBjb2xsZWN0aW9uKSkgcmV0dXJuIGZhbHNlO1xuICAgIGluZGV4ID0ga2V5O1xuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICByZXR1cm4gaW5kZXg7XG59XG5cbi8qKlxuICogQSBzaW1wbGlmaWVkIHZlcnNpb24gbG9kYXNoJ3MgcGljay5cbiAqIEBwYXJhbSB7b2JqZWN0fSBzb3VyY2UgVGhlIHNvdXJjZSBvYmplY3QgdG8gcGljayB0aGUgcHJvcGVydGllcyBmcm9tLlxuICogQHBhcmFtIHtBcnJheTxzdHJpbmc+fSBwcm9wZXJ0aWVzIFRoZSBwcm9wZXJ0aWVzIHRvIHBpY2sgZnJvbSB0aGUgb2JqZWN0LlxuICogQHJldHVybnMge29iamVjdH0gQSBuZXcgb2JqZWN0IGNvbnRhaW5pbmcgdGhlIHNwZWNpZmllZCBwcm9wZXJ0aWVzLlxuICovXG5mdW5jdGlvbiBwaWNrKHNvdXJjZSwgcHJvcGVydGllcykge1xuICBjb25zdCByZXN1bHQgPSB7fTtcbiAgcHJvcGVydGllcy5mb3JFYWNoKChwcm9wZXJ0eSkgPT4geyByZXN1bHRbcHJvcGVydHldID0gc291cmNlW3Byb3BlcnR5XTsgfSk7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgZnVuY3Rpb24gbmFtZSBmb3IgYSBxdWV1ZWlmaWVkIG1ldGhvZCAodXNpbmcgcHJlZml4IGFuZCBzdWZmaXgpLlxuICogQHBhcmFtIHtzdHJpbmd9IG1ldGhvZE5hbWUgVGhlIG5hbWUgb2YgdGhlIG1ldGhvZCB0byBnZXQgdGhlIHF1ZXVlaWZ5IGtleSBvZi5cbiAqIEBwYXJhbSB7c3RyaW5nfSBwcmVmaXggVGhlIGtleSBwcmVmaXguXG4gKiBAcGFyYW0ge3N0cmluZ30gc3VmZml4IFRoZSBrZXkgc3VmZml4LlxuICogQHJldHVybnMge3N0cmluZ30gVGhlIHF1ZXVlaWZpZWQgZnVuY3Rpb24gbmFtZSBvZiBcIm1ldGhvZE5hbWVcIi5cbiAqL1xuZnVuY3Rpb24ga2V5Rm9yUXVldWVpZmllZE1ldGhvZChtZXRob2ROYW1lLCBwcmVmaXgsIHN1ZmZpeCkge1xuICByZXR1cm4gYCR7cHJlZml4fSR7Y2FwaXRhbGl6ZShtZXRob2ROYW1lKX0ke2NhcGl0YWxpemUoc3VmZml4KX1gO1xufVxuXG4vKipcbiAqIFRoZSBtYXNzYWdlZCBkZXF1ZXVlZCBvYmplY3QgcmV0dXJuZWQgZnJvbSBQcm9taXNlUXVldWUjY2xlYXIgYW5kIFByb21pc2VRdWV1ZSNyZW1vdmUuXG4gKiBAcGFyYW0ge29iamVjdH0gZGVxdWV1ZWQgQW4gb2JqZWN0IGRlcXVldWVkIGZyb20gdGhlIHF1ZXVlLlxuICogQHJldHVybnMge29iamVjdH0gVGhlIGV4cG9ydGFibGUgcXVldWUgb2JqZWN0LlxuICovXG5mdW5jdGlvbiBnZXRFeHBvcnRhYmxlUXVldWVPYmplY3QoZGVxdWV1ZWQpIHtcbiAgcmV0dXJuIHtcbiAgICAuLi5waWNrKGRlcXVldWVkLCBQSUNLX0ZST01fRU5RVUVVRUQpLFxuICAgIHJlc29sdmU6IGludm9rZXJPZkFsbFdpdGhBcmd1bWVudHMoZGVxdWV1ZWQucmVzb2x2ZXJzKSxcbiAgICByZWplY3Q6IGludm9rZXJPZkFsbFdpdGhBcmd1bWVudHMoZGVxdWV1ZWQucmVqZWN0b3JzKSxcbiAgfTtcbn1cblxuLyoqXG4gKiBVc2VkIGJ5IEFycmF5LnByb3RvdHlwZS5yZWR1Y2UgdG8gcmVkdWNlIHRoZSBxdWV1ZSB1c2luZyB0aGUgdXNlcidzXG4gKiBgaGFuZGxlUXVldWVSZWR1Y3Rpb25gIG1ldGhvZC5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGhhbmRsZVF1ZXVlUmVkdWN0aW9uIFRoZSB1c2VyJ3MgYGhhbmRsZVF1ZXVlUmVkdWN0aW9uYCBtZXRob2QuXG4gKiBAcmV0dXJucyB7ZnVuY3Rpb259IEEgcXVldWUgcmVkdWNlciwgZ2l2ZW4gYSByZWR1Y2VyIGZ1bmN0aW9uLlxuICovXG5mdW5jdGlvbiBvblF1ZXVlSXRlbVJlZHVjdGlvbihoYW5kbGVRdWV1ZVJlZHVjdGlvbikge1xuICByZXR1cm4gKHJlZHVjZWRRdWV1ZSwgY3VycmVudCwgaW5kZXgsIHF1ZXVlKSA9PiB7XG4gICAgY29uc3QgcHJldmlvdXMgPSBxdWV1ZVtpbmRleCAtIDFdIHx8IG51bGw7XG5cbiAgICBsZXQgZHJvcHBlZCA9IGZhbHNlO1xuICAgIGxldCBjb21iaW5lZCA9IGZhbHNlO1xuXG4gICAgLy8gRHJvcHMgdGhlIGVucXVldWVkIG1ldGhvZCBjYWxsLlxuICAgIC8vIFdhcm5pbmc6IHRoaXMgd2lsbCBjYXVzZSBwcm9taXNlcyB0byBuZXZlciByZXNvbHZlLiBGb3IgdGhhdFxuICAgIC8vIHJlYXNvbiwgdGhpcyBtZXRob2QgcmV0dXJucyB0aGUgcmVqZWN0b3JzIGFuZCByZXNvbHZlcnMuXG4gICAgY29uc3QgZHJvcCA9ICgpID0+IHtcbiAgICAgIGRyb3BwZWQgPSB0cnVlO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcmVzb2x2ZTogaW52b2tlck9mQWxsV2l0aEFyZ3VtZW50cyhjdXJyZW50LnJlc29sdmVycyksXG4gICAgICAgIHJlamVjdDogaW52b2tlck9mQWxsV2l0aEFyZ3VtZW50cyhjdXJyZW50LnJlamVjdG9ycyksXG4gICAgICB9O1xuICAgIH07XG5cbiAgICAvLyBDb21iaW5lcyB0aGUgcHJldmlvdXMgYW5kIGN1cnJlbnQgZW5xdWV1ZWQgbWV0aG9kcy5cbiAgICAvLyBUaGlzIGRvZXNuJ3QgY29tYmluZSB0aGUgZnVuY3Rpb25hbGl0eSwgYnV0IHBhc3Nlc1xuICAgIC8vIGFsbCBvZiB0aGUgcmVzb2x2ZXJzIGFuZCByZWplY3RvcnMgdG8gdGhlIHByZXZpb3VzXG4gICAgLy8gbWV0aG9kIGludm9jYXRpb24gYW5kIGRyb3BzIHRoZSBjdXJyZW50IG9uZSAoZWZmZWN0aXZlbHlcbiAgICAvLyBcImNvbWJpbmluZ1wiIHRoZSBjYWxsIGludG8gYSBzaW5nbGUgb25lKS5cbiAgICBjb25zdCBjb21iaW5lID0gKCkgPT4ge1xuICAgICAgaWYgKCFwcmV2aW91cykgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgY29tYmluZSBxdWV1ZWQgbWV0aG9kIGNhbGxzIHdpdGhvdXQgYSBwcmV2aW91cyB2YWx1ZS4nKTtcbiAgICAgIGNvbWJpbmVkID0gdHJ1ZTtcbiAgICB9O1xuXG4gICAgY29uc3QgcHJldiA9IHByZXZpb3VzICYmIHBpY2socHJldmlvdXMsIFBJQ0tfRlJPTV9FTlFVRVVFRCk7XG4gICAgY29uc3QgY3VyciA9IHBpY2soY3VycmVudCwgUElDS19GUk9NX0VOUVVFVUVEKTtcbiAgICBoYW5kbGVRdWV1ZVJlZHVjdGlvbihwcmV2LCBjdXJyLCBjb21iaW5lLCBkcm9wKTtcblxuICAgIGlmIChjb21iaW5lZCAmJiBkcm9wcGVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBib3RoIGNvbWJpbmUgYW5kIGRyb3AgYW4gZW5xdWV1ZWQgbWV0aG9kIGNhbGwuJyk7XG4gICAgfVxuXG4gICAgLy8gSWYgdGhlIGNhbGxzIHdlcmUgXCJjb21iaW5lZFwiLCBwYXNzIHRoZSByZXNvbHZlcnMgYW5kIHJlamVjdG9yc1xuICAgIC8vIG9mIHRoZSBjdXJyZW50IG1ldGhvZCB0byB0aGUgcHJldmlvdXMgb25lLiBJZiBpdCB3YXNuJ3QgZHJvcHBlZFxuICAgIC8vIGtlZXAgdGhlIGN1cnJlbnQgbWV0aG9kIGluIHRoZSBxdWV1ZS5cbiAgICBpZiAoY29tYmluZWQpIHtcbiAgICAgIHByZXZpb3VzLnJlc29sdmVycy5wdXNoKC4uLmN1cnJlbnQucmVzb2x2ZXJzKTtcbiAgICAgIHByZXZpb3VzLnJlamVjdG9ycy5wdXNoKC4uLmN1cnJlbnQucmVqZWN0b3JzKTtcbiAgICB9IGVsc2UgaWYgKCFkcm9wcGVkKSB7XG4gICAgICByZWR1Y2VkUXVldWUucHVzaChjdXJyZW50KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVkdWNlZFF1ZXVlO1xuICB9O1xufVxuXG4vKipcbiAqIEl0ZXJhdGVzIGFuIG9iamVjdCdzIG93biBhbmQgaW5oZXJpdGVkIGZ1bmN0aW9ucyBhbmQgd2Fsa3MgdGhlIHByb3RvdHlwZSBjaGFpbiB1bnRpbFxuICogT2JqZWN0LnByb3RvdHlwZSBpcyByZWFjaGVkLiBUaGlzIHdpbGwgYmUgdXNlZCB0byBxdWV1ZWlmeSBpbmhlcml0ZWQgZnVuY3Rpb25zIGJlbG93LlxuICogQHBhcmFtIHtvYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGNhbGwgYGl0ZXJhdGVlYCBvbiBmb3IgZWFjaCBvd24gYW5kIGluaGVyaXRlZCBwcm9wZXJ0eS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGl0ZXJhdGVlIFRoZSBjYWxsYmFjayB0byBpbnZva2UgZm9yIGVhY2ggcHJvcGVydHkuXG4gKiBAcGFyYW0ge29iamVjdH0gaGFuZGxlZCBLZWVwcyB0cmFjayBvZiBwcm9wZXJ0aWVzIHRoYXQgaGF2ZSBhbHJlYWR5IGJlZW4gcXVldWVpZmllZFxuICogbG93ZXIgZG93biBpbiB0aGUgcHJvdG90eXBlIGNoYWluIHRvIHByZXZlbnQgb3ZlcndyaXRpbmcgcHJldmlvdXMgcXVldWVpZmljYXRpb25zLlxuICogQHJldHVybnMge3VuZGVmaW5lZH1cbiAqL1xuZnVuY3Rpb24gZm9yRWFjaE93bkFuZEluaGVyaXRlZEZ1bmN0aW9uKG9iamVjdCwgaXRlcmF0ZWUsIGhhbmRsZWQgPSB7fSkge1xuICAvLyBEb24ndCBwcm9taXNpZnkgbmF0aXZlIHByb3RvdHlwZSBwcm9wZXJ0aWVzLlxuICBpZiAoIW9iamVjdCB8fCBOQVRJVkVTX1BST1RPVFlQRVMuaW5kZXhPZihvYmplY3QpID4gLTEpIHJldHVybjtcbiAgY29uc3QgdmlzaXRlZCA9IGhhbmRsZWQ7XG5cbiAgLy8gSXRlcmF0ZSB0aGUgb2JqZWN0J3Mgb3duIHByb3BlcnRpZXNcbiAgT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMob2JqZWN0KS5mb3JFYWNoKChwcm9wZXJ0eSkgPT4ge1xuICAgIGlmICh2aXNpdGVkW3Byb3BlcnR5XSkgcmV0dXJuO1xuICAgIHZpc2l0ZWRbcHJvcGVydHldID0gdHJ1ZTtcblxuICAgIGNvbnN0IHZhbHVlID0gb2JqZWN0W3Byb3BlcnR5XTtcbiAgICBpZiAodHlwZW9mIHZhbHVlICE9PSAnZnVuY3Rpb24nIHx8IHByb3BlcnR5ID09PSAnY29uc3RydWN0b3InKSByZXR1cm47XG4gICAgaXRlcmF0ZWUodmFsdWUsIHByb3BlcnR5KTtcbiAgfSk7XG5cbiAgLy8gSXRlcmF0ZSB0aGUgb2JqZWN0J3MgY29uc3RydWN0b3IgcHJvcGVydGllcyAoc3RhdGljIHByb3BlcnRpZXMpXG4gIGlmIChOQVRJVkVTLmluZGV4T2Yob2JqZWN0LmNvbnN0cnVjdG9yKSA9PT0gLTEpIHtcbiAgICBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyhvYmplY3QuY29uc3RydWN0b3IpLmZvckVhY2goKHByb3BlcnR5KSA9PiB7XG4gICAgICBpZiAodmlzaXRlZFtwcm9wZXJ0eV0pIHJldHVybjtcbiAgICAgIHZpc2l0ZWRbcHJvcGVydHldID0gdHJ1ZTtcblxuICAgICAgY29uc3QgdmFsdWUgPSBvYmplY3QuY29uc3RydWN0b3JbcHJvcGVydHldO1xuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ2Z1bmN0aW9uJyB8fCBwcm9wZXJ0eSA9PT0gJ3Byb3RvdHlwZScpIHJldHVybjtcbiAgICAgIGl0ZXJhdGVlKHZhbHVlLCBwcm9wZXJ0eSk7XG4gICAgfSk7XG4gIH1cblxuICBmb3JFYWNoT3duQW5kSW5oZXJpdGVkRnVuY3Rpb24oT2JqZWN0LmdldFByb3RvdHlwZU9mKG9iamVjdCksIGl0ZXJhdGVlLCB2aXNpdGVkKTtcbn1cblxuLyoqXG4gKiBBIHF1ZXVlIHRoYXQgcnVucyBvbmx5IGBtYXhDb25jdXJyZW5jeWAgZnVuY3Rpb25zIGF0IGEgdGltZSwgdGhhdFxuICogY2FuIGFsc28gb3BlcmF0ZSBhcyBhIHN0YWNrLiBJdGVtcyBpbiB0aGUgcXVldWUgYXJlIGRlcXVldWVkIG9uY2VcbiAqIHByZXZpb3VzIGZ1bmN0aW9ucyBoYXZlIGZ1bGx5IHJlc29sdmVkLlxuICogQGNsYXNzIFByb21pc2VRdWV1ZVxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGNsYXNzIFByb21pc2VRdWV1ZSB7XG4gIC8qKlxuICAgKiBXb3JrcyBsaWtlIEJsdWViaXJkJ3MgUHJvbWlzZS5wcm9taXNpZnkuXG4gICAqIEdpdmVuIGEgZnVuY3Rpb24sIHRoaXMgd2lsbCByZXR1cm4gYSB3cmFwcGVyIGZ1bmN0aW9uIHRoYXQgZW5xdWV1ZSdzIGEgY2FsbFxuICAgKiB0byB0aGUgZnVuY3Rpb24gdXNpbmcgZWl0aGVyIHRoZSBwcm92aWRlZCBQcm9taXNlUXVldWUgaXNudGFuY2Ugb3IgYSBuZXcgb25lLlxuICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBtZXRob2QgVGhlIG1ldGhvZCB0byBxdWV1ZWlmeS5cbiAgICogQHBhcmFtIHtvYmplY3R9IG9wdGlvbnMgUXVldWVpZmljYXRpb24gb3B0aW9ucy5cbiAgICogQHBhcmFtIHtQcm9taXNlUXVldWU9fSBvcHRpb25zLnF1ZXVlIFRoZSBxdWV1ZSB0aGUgd3JhcHBlciBmdW5jdGlvbiB3aWxsIG9wZXJhdGUgdXNpbmcuXG4gICAqIEBwYXJhbSB7YW55fSBvcHRpb25zLmNvbnRleHQgVGhlIHZhbHVlIGZvciBgdGhpc2AgaW4gdGhlIHF1ZXVlaWZpZWQgZnVuY3Rpb24uXG4gICAqIEByZXR1cm5zIHtmdW5jdGlvbn0gVGhlIHF1ZXVlaWZpZWQgdmVyc2lvbiBvZiB0aGUgZnVuY3Rpb24uXG4gICAqIEBtZW1iZXJvZiBQcm9taXNlUXVldWVcbiAgICogQHN0YXRpY1xuICAgKi9cbiAgc3RhdGljIHF1ZXVlaWZ5KG1ldGhvZCwge1xuICAgIHF1ZXVlID0gbmV3IFByb21pc2VRdWV1ZSgpLFxuICAgIGNvbnRleHQgPSBxdWV1ZSxcbiAgICBwcmlvcml0eSA9IDAsXG4gIH0gPSB7fSkge1xuICAgIGlmICh0eXBlb2YgbWV0aG9kICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgICAnWW91IG11c3QgcGFzcyBhIGZ1bmN0aW9uIGZvciBwYXJhbWV0ZXIgXCJtZXRob2RcIiB0byBxdWV1ZWlmeS4nLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAoIShxdWV1ZSBpbnN0YW5jZW9mIFByb21pc2VRdWV1ZSkpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXG4gICAgICAgICdQcm9taXNlUXVldWUucXVldWVpZnkgZXhwZWN0ZWQgYW4gaW5zdGFuY2Ugb2YgUHJvbWlzZVF1ZXVlIGZvciBwYXJhbWV0ZXIgXCJxdWV1ZVwiLicsXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiAoLi4uYXJncykgPT4gcXVldWUuZW5xdWV1ZShtZXRob2QsIHsgYXJncywgY29udGV4dCwgcHJpb3JpdHkgfSk7XG4gIH1cblxuICAvKipcbiAgICogV29ya3MgbGlrZSBCbHVlYmlyZCdzIFByb21pc2UucHJvbWlzaWZ5QWxsLlxuICAgKiBHaXZlbiBhbiBvYmplY3QsIHRoaXMgbWV0aG9kIHdpbGwgY3JlYXRlIGEgbmV3IFwicXVldWVkXCIgdmVyc2lvbiBvZiBlYWNoIGZ1bmN0aW9uXG4gICAqIG9uIHRoZSBvYmplY3QgYW5kIGFzc2lnbiBpdCB0byB0aGUgb2JqZWN0IGFzIFtwcmVmaXhdW21ldGhvZCBuYW1lXVtzdWZmaXhdIChjYW1lbCBjYXNlZCkuXG4gICAqIEFsbCBjYWxscyB0byB0aGUgcXVldWVkIHZlcnNpb24gd2lsbCB1c2UgUHJvbWlzZVF1ZXVlI2VucXVldWUuXG4gICAqICpOb3RlKiBUaGlzIHdpbGwgbXV0YXRlIHRoZSBwYXNzZWQgaW4gb2JqZWN0LlxuICAgKiBAcGFyYW0ge29iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gY3JlYXRlIG5ldyBxdWVpZmllZCBmdW5jdGlvbnMgb24uXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zIFF1ZWlmaWNhdGlvbiBvcHRpb25zLlxuICAgKiBAcGFyYW0ge3N0cmluZz19IG9wdGlvbnMucHJlZml4IEEgcHJlZml4IHByZXBlbmRlZCB0byBxdWV1ZWlmaWVkIGZ1bmN0aW9uIHByb3BlcnR5IG5hbWVzLlxuICAgKiBAcGFyYW0ge3N0cmluZz19IG9wdGlvbnMuc3VmZml4IEEgc3VmZml4IGFwcGVuZGVkIHRvIHF1ZXVlaWZpZWQgZnVuY3Rpb24gcHJvcGVydHkgbmFtZXMuXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zLnByaW9yaXRpZXMgQSBtYXBwaW5nIG9mIHRoZSAqb3JpZ2luYWwqIGZ1bmN0aW9uIG5hbWVzIHRvXG4gICAqIHF1ZXVlIHByaW9yaXRpZXMuXG4gICAqIEBwYXJhbSB7UHJvbWlzZVF1ZXVlPX0gb3B0aW9ucy5xdWV1ZSBUaGUgUHJvbWlzZVF1ZXVlIGluc3RhbmNlIGZvciBlYWNoIGZ1bmN0aW9uXG4gICAqIHRvIG9wZXJhdGUgdXNpbmcuXG4gICAqIEBwYXJhbSB7c3RyaW5nPX0gYXNzaWduUXVldWVBc1Byb3BlcnR5IFRoZSBwcm9wZXJ0eSBuYW1lIHRvIGFzc2lnbiB0aGUgUHJvbWlzZVF1ZXVlIGluc3RhbmNlXG4gICAqIG9uIHRoZSBvYmplY3QgYXMuIFNldCB0aGlzIHRvIGEgZmFsc3kgdmFsdWUgdG8gb21pdCBhZGRpbmcgYSByZWZlcmVuY2UgdG8gdGhlIHF1ZXVlLlxuICAgKiBAcmV0dXJucyB7b2JqZWN0fSBUaGUgb3JpZ2luYWxseSBwYXNzZWQgaW4gb2JqZWN0IHdpdGggbmV3IHF1ZXVlaWZpZWQgZnVuY3Rpb25zIGF0dGFjaGVkLlxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqIEBzdGF0aWNcbiAgICovXG4gIHN0YXRpYyBxdWV1ZWlmeUFsbChvYmplY3QsIHtcbiAgICBwcmVmaXggPSAncXVldWVkJyxcbiAgICBzdWZmaXggPSAnJyxcbiAgICBwcmlvcml0aWVzID0ge30sXG4gICAgcXVldWUgPSBuZXcgUHJvbWlzZVF1ZXVlKCksXG4gICAgYXNzaWduUXVldWVBc1Byb3BlcnR5ID0gJ3F1ZXVlJyxcbiAgfSA9IHt9KSB7XG4gICAgaWYgKHR5cGVvZiBvYmplY3QgIT09ICdvYmplY3QnIHx8ICFPYmplY3QuaXNFeHRlbnNpYmxlKG9iamVjdCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IHF1ZXVlaWZ5IGEgbm9uLW9iamVjdCBvciBub24tZXh0ZW5zaWJsZSBvYmplY3QuJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdGFyZ2V0ID0gb2JqZWN0O1xuICAgIGNvbnN0IGZ1bmN0aW9ucyA9IFtdO1xuXG4gICAgLy8gSXRlcmF0ZSBvdmVyIGFsbCBvZiB0aGUgb2JqZWN0J3Mgb3duIGFuZCBpbmhlcml0ZWQgZnVuY3Rpb25zIGFuZCBxdWV1ZWlmeSBlYWNoIG1ldGhvZC5cbiAgICAvLyBUaGlzIHdpbGwgYWRkIGEgbmV3IHByb3Blcnkgb24gdGhlIG9iamVjdCBbcHJlZml4XVttZXRob2QgbmFtZV1bc3VmZml4XS5cbiAgICBmb3JFYWNoT3duQW5kSW5oZXJpdGVkRnVuY3Rpb24odGFyZ2V0LFxuICAgICAgKHZhbHVlLCBwcm9wZXJ0eSkgPT4gZnVuY3Rpb25zLnB1c2goeyB2YWx1ZSwgcHJvcGVydHkgfSksXG4gICAgKTtcblxuICAgIGZ1bmN0aW9ucy5mb3JFYWNoKCh7IHZhbHVlLCBwcm9wZXJ0eSB9KSA9PiB7XG4gICAgICB0YXJnZXRba2V5Rm9yUXVldWVpZmllZE1ldGhvZChwcm9wZXJ0eSwgcHJlZml4LCBzdWZmaXgpXSA9IFByb21pc2VRdWV1ZS5xdWV1ZWlmeSh2YWx1ZSwge1xuICAgICAgICBxdWV1ZSxcbiAgICAgICAgY29udGV4dDogdGFyZ2V0LFxuICAgICAgICBwcmlvcml0eTogTnVtYmVyKHByaW9yaXRpZXNbcHJvcGVydHldKSB8fCAwLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBTdG9yZSBvZmYgYSByZWZlcmVuY2UgdG8gdGhlIG9iamVjdCdzIHF1ZXVlIGZvciB1c2VyIHVzZS5cbiAgICAvLyBUaGlzIGNhbiBiZSBkaXNhYmxlZCBieSBzZXR0aW5nIGBhc3NpZ25RdWV1ZUFzUHJvcGVydHlgIHRvIGZhbHNlLlxuICAgIGlmICh0eXBlb2YgYXNzaWduUXVldWVBc1Byb3BlcnR5ID09PSAnc3RyaW5nJykgdGFyZ2V0W2Fzc2lnblF1ZXVlQXNQcm9wZXJ0eV0gPSBxdWV1ZTtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYW4gaW5zdGFuY2Ugb2YgUHJvbWlzZVF1ZXVlLlxuICAgKiBAcGFyYW0ge29iamVjdH0gb3B0aW9ucyBQcm9taXNlUXVldWUgaW5zdGFuY2Ugb3B0aW9ucy5cbiAgICogQHBhcmFtIHtib29sZWFuPX0gb3B0aW9ucy5saWZvIElmIHRydWUsIHRoZSBpbnN0YW5jZSB3aWxsIG9wZXJhdGUgYXMgYSBzdGFja1xuICAgKiByYXRoZXIgdGhhbiBhIHF1ZXVlICh1c2luZyAucG9wIGluc3RlYWQgb2YgLnNoaWZ0KS5cbiAgICogQHBhcmFtIHtudW1iZXJ9IG9wdGlvbnMubWF4Q29uY3VycmVuY3kgVGhlIG1heGltdW0gbnVtYmVyIG9mIHF1ZXVlIG1ldGhvZHMgdGhhdCBjYW5cbiAgICogcnVuIGNvbmN1cnJlbnRseS4gRGVmYXVsdHMgdG8gMSBhbmQgaXMgY2xhcGVkIHRvIFsxLCBJbmZpbmlmeV0uXG4gICAqL1xuICBjb25zdHJ1Y3Rvcih7XG4gICAgbGlmbyA9IGZhbHNlLFxuICAgIG9uUXVldWVEcmFpbmVkLFxuICAgIG9uTWV0aG9kRW5xdWV1ZWQsXG4gICAgbWF4Q29uY3VycmVuY3kgPSAxLFxuICAgIGhhbmRsZVF1ZXVlUmVkdWN0aW9uLFxuICAgIG9uTWV0aG9kRGVwcmlvcml0aXplZCxcbiAgfSA9IHt9KSB7XG4gICAgdGhpcy5xdWV1ZSA9IFtdO1xuICAgIHRoaXMucnVubmluZyA9IDA7XG4gICAgdGhpcy5saWZvID0gQm9vbGVhbihsaWZvKTtcblxuICAgIHRoaXMuaXNEcmFpbmVkID0gZmFsc2U7XG4gICAgdGhpcy5pc1BhdXNlZCA9IGZhbHNlO1xuXG4gICAgdGhpcy5oYW5kbGVRdWV1ZVJlZHVjdGlvbiA9IGhhbmRsZVF1ZXVlUmVkdWN0aW9uO1xuICAgIHRoaXMub25NZXRob2REZXByaW9yaXRpemVkID0gb25NZXRob2REZXByaW9yaXRpemVkO1xuXG4gICAgdGhpcy5vblF1ZXVlRHJhaW5lZCA9IG9uUXVldWVEcmFpbmVkO1xuICAgIHRoaXMub25NZXRob2RFbnF1ZXVlZCA9IG9uTWV0aG9kRW5xdWV1ZWQ7XG4gICAgdGhpcy5zZXRNYXhDb25jdXJyZW5jeShtYXhDb25jdXJyZW5jeSk7XG5cbiAgICAvLyBBbiBvcHRpbWl6YXRpb24gdG8gcHJldmVudCBzb3J0aW5nIHRoZSBxdWV1ZSBvbiBldmVyeSBlbnF1ZXVlXG4gICAgLy8gdW50aWwgYSBwcmlvcml0eSBoYXMgYmVlbiBzZXQgb24gYSBtZXRob2QuXG4gICAgdGhpcy5wcmlvcml0eVNvcnRNb2RlID0gZmFsc2U7XG4gIH1cblxuICAvKipcbiAgICogQHJldHVybnMge251bWJlcn0gVGhlIG51bWJlciBvZiBlbnF1ZXVlZCBpdGVtcy5cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKiBAcmVhZG9ubHlcbiAgICovXG4gIGdldCBzaXplKCkge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlLmxlbmd0aDtcbiAgfVxuXG4gIC8qKlxuICAgKiBBbiBhbGlhcyBmb3IgXCJlbnF1ZXVlXCIuXG4gICAqIElmIGluIGxpZm8gbW9kZSB0aGlzIHZlcmIgbWlnaHQgYmUgbW9yZSBjb3JyZWN0LlxuICAgKiBAcmVhZG9ubHlcbiAgICovXG4gIGdldCBwdXNoKCkge1xuICAgIHJldHVybiB0aGlzLmVucXVldWU7XG4gIH1cblxuICAvKipcbiAgICogU2V0cyB0aGUgcXVldWUncyBtYXhpbXVtIGNvbmN1cnJlbmN5LlxuICAgKiBAcGFyYW0ge251bWJlcn0gbWF4Q29uY3VycmVuY3kgVGhlIGNvbmN1cnJlbnQgdmFsdWUgdG8gc2V0LlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZVF1ZXVlfSBUaGUgY3VycmVudCBQcm9taXNlUXVldWUgaW5zdGFuY2UgZm9yIGNoYWluaW5nLlxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqL1xuICBzZXRNYXhDb25jdXJyZW5jeShtYXhDb25jdXJyZW5jeSkge1xuICAgIHRoaXMubWF4Q29uY3VycmVuY3kgPSBNYXRoLm1heChOdW1iZXIobWF4Q29uY3VycmVuY3kpIHx8IDEsIDEpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIENhbGxlZCB3aGVuIGEgdGFzayBoYXMgc3RhcnRlZCBwcm9jZXNzaW5nLlxuICAgKiBAcmV0dXJucyB7dW5kZWZpbmVkfVxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqL1xuICBvbk1ldGhvZFN0YXJ0ZWQoKSB7XG4gICAgdGhpcy5ydW5uaW5nKys7XG4gIH1cblxuICAvKipcbiAgICogQ2FsbGVkIHdoZW4gYSB0YXNrIGhhcyBmaW5pc2hlZCBwcm9jZXNzaW5nLiBUaGlzIGlzIGNhbGxlZCByZWdhcmRsZXNzXG4gICAqIG9mIHdoZXRoZXIgb3Igbm90IHRoZSB1c2VyJ3MgcXVldWVkIG1ldGhvZCBzdWNjZWVkcyBvciB0aHJvd3MuXG4gICAqIEBwYXJhbSB7ZnVuY3Rpb259IHJlc29sdmVycyBUaGUgcnVubmluZyBtZXRob2QncyByZXNvbHZlL3JlamVjdCBmdW5jdGlvbnMuXG4gICAqIEBwYXJhbSB7YW55fSByZXN1bHQgVGhlIHJlc3VsdCB5aWVsZGVkIGZyb20gdGhlIG1ldGhvZCdzIGludm9jYXRpb24uXG4gICAqIEByZXR1cm5zIHt1bmRlZmluZWR9XG4gICAqIEBtZW1iZXJvZiBQcm9taXNlUXVldWVcbiAgICovXG4gIG9uTWV0aG9kQ29tcGxldGVkKHJlc29sdmVycywgcmVzdWx0KSB7XG4gICAgdGhpcy5ydW5uaW5nLS07XG4gICAgaW52b2tlQWxsV2l0aEFyZ3VtZW50cyhyZXNvbHZlcnMsIFtyZXN1bHRdKTtcbiAgICB0aGlzLnRpY2soKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBcIlRpY2tzXCIgdGhlIHF1ZXVlLiBUaGlzIHdpbGwgc3RhcnQgcHJvY2VzcyB0aGUgbmV4dCBpdGVtIGluIHRoZSBxdWV1ZVxuICAgKiBpZiB0aGUgcXVldWUgaXMgaWRsZSBvciBoYXNuJ3QgcmVhY2hlZCB0aGUgcXVldWUncyBgbWF4Q29uY3VycmVuY3lgLlxuICAgKiBAcmV0dXJucyB7dW5kZWZpbmVkfVxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqL1xuICB0aWNrKCkge1xuICAgIC8vIE5vdGhpbmcgbGVmdCB0byBwcm9jZXNzIGluIHRoZSBxdWV1ZVxuICAgIGlmICghdGhpcy5xdWV1ZS5sZW5ndGgpIHtcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5vblF1ZXVlRHJhaW5lZCA9PT0gJ2Z1bmN0aW9uJyAmJiAhdGhpcy5pc0RyYWluZWQpIHRoaXMub25RdWV1ZURyYWluZWQoKTtcbiAgICAgIHRoaXMuaXNEcmFpbmVkID0gdHJ1ZTtcbiAgICAgIHRoaXMucHJpb3JpdHlTb3J0TW9kZSA9IGZhbHNlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFRvbyBtYW55IHJ1bm5pbmcgdGFza3Mgb3IgdGhlIHF1ZXVlIGlzIHBhdXNlZC5cbiAgICBpZiAodGhpcy5ydW5uaW5nID49IHRoaXMubWF4Q29uY3VycmVuY3kgfHwgdGhpcy5pc1BhdXNlZCkgcmV0dXJuO1xuICAgIHRoaXMub25NZXRob2RTdGFydGVkKCk7XG5cbiAgICAvLyBQcm9jZXNzIHRoZSBuZXh0IHRhc2sgaW4gdGhlIHF1ZXVlLlxuICAgIC8vIFRoaXMgd2lsbCBpbmNyZW1lbnQgdGhlIG51bWJlciBvZiBcImNvbmN1cnJlbnRseSBydW5uaW5nIG1ldGhvZHNcIixcbiAgICAvLyBydW4gdGhlIG1ldGhvZCwgYW5kIHRoZW4gZGVjcmVtZW50IHRoZSBydW5uaW5nIG1ldGhvZHMuXG4gICAgY29uc3Qge1xuICAgICAgYXJncyxcbiAgICAgIG1ldGhvZCxcbiAgICAgIGNvbnRleHQsXG4gICAgICByZXNvbHZlcnMsXG4gICAgICByZWplY3RvcnMsXG4gICAgfSA9IHRoaXMucXVldWVbdGhpcy5saWZvID8gJ3BvcCcgOiAnc2hpZnQnXSgpO1xuXG4gICAgLy8gV2UgbXVzdCBjYWxsIHRoZSBmdW5jdGlvbiBpbWVkaWF0ZWx5IHNpbmNlIHdlJ3ZlIGFscmVhZHlcbiAgICAvLyBkZWZlcnJlZCBpbnZvY2F0aW9uIG9uY2UgKGluIGBlbnF1ZXVlYCkuIE90aGVyd2lzZSwgd2Ugd2lsbFxuICAgIC8vIGdldCBhIHN0cmFuZ2Ugb3JkZXIgb2YgZXhlY3V0aW9uLlxuICAgIGxldCByZXR1cm5lZDtcblxuICAgIHRyeSB7XG4gICAgICByZXR1cm5lZCA9IG1ldGhvZC5jYWxsKGNvbnRleHQsIC4uLmFyZ3MpO1xuXG4gICAgICBpZiAocmV0dXJuZWQgJiYgcmV0dXJuZWRbSVNfUFJPTUlTRV9RVUVVRV9QUk9NSVNFXSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgJ1F1ZXVlIG91dCBvZiBvcmRlciBleGVjdXRpb246IGNhbm5vdCByZXNvbHZlIHdpdGggc29tZXRoaW5nIHRoYXQgJyArXG4gICAgICAgICAgXCJ3b24ndCBiZSBjYWxsZWQgdW50aWwgdGhpcyBmdW5jdGlvbiBjb21wbGV0ZXMuXCIsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhpcy5vbk1ldGhvZENvbXBsZXRlZChyZWplY3RvcnMsIGUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIFByb21pc2UucmVzb2x2ZShyZXR1cm5lZClcbiAgICAgIC5jYXRjaChlID0+IHRoaXMub25NZXRob2RDb21wbGV0ZWQocmVqZWN0b3JzLCBlKSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gdGhpcy5vbk1ldGhvZENvbXBsZXRlZChyZXNvbHZlcnMsIHJlc3VsdHMpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTb3J0cyB0aGUgcXVldWUgYmFzZWQgb24gcHJpb3JpdGllcy5cbiAgICogQHJldHVybnMge3VuZGVmaW5lZH1cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgcHJpb3JpdGl6ZVF1ZXVlKCkge1xuICAgIGNvbnN0IGRlcHJpb3JpdGl6ZWQgPSBbXTtcbiAgICBjb25zdCBzb3J0ZXIgPSB0aGlzLmxpZm8gPyBwcmlvcml0eVNvcnRMSUZPIDogcHJpb3JpdHlTb3J0RklGTztcbiAgICB0aGlzLnF1ZXVlLnNvcnQoc29ydGVyKGRlcHJpb3JpdGl6ZWQpKTtcblxuICAgIGlmICh0eXBlb2YgdGhpcy5vbk1ldGhvZERlcHJpb3JpdGl6ZWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGRlcHJpb3JpdGl6ZWQuZm9yRWFjaCgoZW5xdWV1ZWQpID0+IHtcbiAgICAgICAgY29uc3QgcHJpbyA9IE51bWJlcih0aGlzLm9uTWV0aG9kRGVwcmlvcml0aXplZChwaWNrKGVucXVldWVkLCBQSUNLX0ZST01fRU5RVUVVRUQpKSkgfHwgMDtcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXBhcmFtLXJlYXNzaWduXG4gICAgICAgIGVucXVldWVkLnByaW9yaXR5ID0gcHJpbztcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDYWxscyB0aGUgYGhhbmRsZVF1ZXVlUmVkdWN0aW9uYCBvbiBlYWNoIGl0ZW0gaW4gdGhlIHF1ZXVlLCBhbGxvd2luZyB1c2Vyc1xuICAgKiB0byBcImNvbWJpbmVcIiBzaW1pbGFyIHF1ZXVlZCBtZXRob2RzIGludG8gYSBzaW5nbGUgY2FsbC5cbiAgICogQHJldHVybnMge3VuZGVmaW5lZH1cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgcmVkdWNlUXVldWUoKSB7XG4gICAgaWYgKHR5cGVvZiB0aGlzLmhhbmRsZVF1ZXVlUmVkdWN0aW9uICE9PSAnZnVuY3Rpb24nKSByZXR1cm47XG4gICAgdGhpcy5xdWV1ZSA9IHRoaXMucXVldWUucmVkdWNlKG9uUXVldWVJdGVtUmVkdWN0aW9uKHRoaXMuaGFuZGxlUXVldWVSZWR1Y3Rpb24pLCBbXSk7XG4gIH1cblxuICAvKipcbiAgICogQWRkcyBhIG1ldGhvZCBpbnRvIHRoZSBQcm9taXNlUXVldWUgZm9yIGRlZmVycmVkIGV4ZWN1dGlvbi5cbiAgICogQHBhcmFtIHtmdW5jdGlvbn0gbWV0aG9kIFRoZSBmdW5jdGlvbiB0byBlbnF1ZXVlLlxuICAgKiBAcGFyYW0ge29iamVjdH0gb3B0aW9ucyBNZXRob2Qgc3BlY2lmaWMgZW5xdWV1ZWluZyBvcHRpb25zLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZX0gUmVzb2x2ZXMgb25jZSB0aGUgcGFzc2VkIGluIG1ldGhvZCBpcyBkZXF1ZXVlZCBhbmQgZXhlY3V0ZWQgdG8gY29tcGxldGlvbi5cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgZW5xdWV1ZShtZXRob2QsIG9wdGlvbnMgPSB7fSkge1xuICAgIGNvbnN0IGVucXVldWVkTWV0aG9kUHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IHsgYXJncyA9IFtdLCBwcmlvcml0eSA9IDAsIGNvbnRleHQgPSB0aGlzIH0gPSBvcHRpb25zO1xuXG4gICAgICBpZiAodHlwZW9mIG1ldGhvZCAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICByZXR1cm4gcmVqZWN0KG5ldyBUeXBlRXJyb3IoXG4gICAgICAgICAgJ1Byb21pc2VRdWV1ZSNlbnF1ZXVlIGV4cGVjdGVkIGEgZnVuY3Rpb24gZm9yIGFyZ3VtZW50IFwibWV0aG9kXCIuJyxcbiAgICAgICAgKSk7XG4gICAgICB9XG5cbiAgICAgIGlmICghKGFyZ3MgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgcmV0dXJuIHJlamVjdChuZXcgVHlwZUVycm9yKFxuICAgICAgICAgICdQcm9taXNlUXVldWUjZW5xdWV1ZSBleHBlY3RlZCBhbiBhcnJheSBmb3IgYXJndW1lbnQgXCJvcHRpb25zLmFyZ3NcIi4nLFxuICAgICAgICApKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5xdWV1ZS5wdXNoKHtcbiAgICAgICAgYXJncyxcbiAgICAgICAgbWV0aG9kLFxuICAgICAgICBjb250ZXh0LFxuICAgICAgICBwcmlvcml0eTogTnVtYmVyKHByaW9yaXR5KSB8fCAwLFxuICAgICAgICByZWplY3RvcnM6IFtyZWplY3RdLFxuICAgICAgICByZXNvbHZlcnM6IFtyZXNvbHZlXSxcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLmlzRHJhaW5lZCA9IGZhbHNlO1xuXG4gICAgICAvLyBUb2dnbGVzIHRoZSBxdWV1ZSBmcm9tIHVuLXNvcnRlZCBtb2RlIHRvIHByaW9yaXR5IHNvcnQgbW9kZS5cbiAgICAgIGlmIChOdW1iZXIocHJpb3JpdHkpICE9PSAwKSB0aGlzLnByaW9yaXR5U29ydE1vZGUgPSB0cnVlO1xuXG4gICAgICAvLyBGaXJzdCBwcmlvcml0aXplIHRoZSBxdWV1ZSAoc29ydCBpdCBieSBwcmlvcml0aWVzKSxcbiAgICAgIC8vIHRoZW4gYWxsb3cgdGhlIHVzZXIgdGhlIG9wcG9ydHVuaXR5IHRvIHJlZHVjZSBpdC5cbiAgICAgIGlmICh0aGlzLnByaW9yaXR5U29ydE1vZGUpIHRoaXMucHJpb3JpdGl6ZVF1ZXVlKCk7XG4gICAgICB0aGlzLnJlZHVjZVF1ZXVlKCk7XG5cbiAgICAgIGlmICh0eXBlb2YgdGhpcy5vbk1ldGhvZEVucXVldWVkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRoaXMub25NZXRob2RFbnF1ZXVlZChtZXRob2QsIG9wdGlvbnMpO1xuICAgICAgfVxuXG4gICAgICAvLyBEZWZlciB0aGUgZXhlY3V0aW9uIG9mIHRoZSB0aWNrIHVudGlsIHRoZSBuZXh0IGl0ZXJhdGlvbiBvZiB0aGUgZXZlbnQgbG9vcFxuICAgICAgLy8gVGhpcyBpcyBpbXBvcnRhbnQgc28gd2UgYWxsb3cgYWxsIHN5bmNocm9ub3VzIFwiZW5xdWV1ZXNcIiBvY2N1ciBiZWZvcmUgYW55XG4gICAgICAvLyBlbnF1ZXVlZCBtZXRob2RzIGFyZSBhY3R1YWxseSBpbnZva2VkLlxuICAgICAgUHJvbWlzZS5yZXNvbHZlKCkudGhlbigoKSA9PiB0aGlzLnRpY2soKSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH0pO1xuXG4gICAgZW5xdWV1ZWRNZXRob2RQcm9taXNlW0lTX1BST01JU0VfUVVFVUVfUFJPTUlTRV0gPSB0cnVlO1xuICAgIHJldHVybiBlbnF1ZXVlZE1ldGhvZFByb21pc2U7XG4gIH1cblxuICAvKipcbiAgICogQHJldHVybnMge0FycmF5PGZ1bmN0aW9uPn0gQSBzaGFsbG93IGNvcHkgb2YgdGhlIHF1ZXVlJ3MgZW5xdWV1ZWQgbWV0aG9kcy5cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgZ2V0RW5xdWV1ZWRNZXRob2RzKCkge1xuICAgIHJldHVybiB0aGlzLnF1ZXVlLm1hcCgoeyBtZXRob2QgfSkgPT4gbWV0aG9kKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhcnMgYWxsIGVucXVldWVkIG1ldGhvZHMgZnJvbSB0aGUgcXVldWUuIEFueSBtZXRob2QgdGhhdCdzIGFscmVhZHlcbiAgICogYmVlbiBkZXF1ZXVlZCB3aWxsIHN0aWxsIHJ1biB0byBjb21wbGV0aW9uLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZVF1ZXVlfSBUaGUgY3VycmVudCBQcm9taXNlUXVldWUgaW5zdGFuY2UgZm9yIGNoYWluaW5nLlxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqL1xuICBjbGVhcigpIHtcbiAgICBjb25zdCB2YWx1ZXMgPSB0aGlzLnF1ZXVlLm1hcChnZXRFeHBvcnRhYmxlUXVldWVPYmplY3QpO1xuICAgIHRoaXMucXVldWUgPSBbXTtcbiAgICByZXR1cm4gdmFsdWVzO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYW4gZW5xdWV1ZWQgbWV0aG9kIGZyb20gdGhlIHF1ZXVlLiBJZiB0aGUgbWV0aG9kIHRvIHJlbW92ZVxuICAgKiBoYXMgYWxyZWFkeSBzdGFydGVkIHByb2Nlc3NpbmcsIGl0IHdpbGwgKm5vdCogYmUgcmVtb3ZlZC5cbiAgICogQHBhcmFtIHtmdW5jdGlvbn0gbWV0aG9kIFRoZSBtZXRob2QgdG8gcmVtb3ZlLlxuICAgKiBAcmV0dXJucyB7ZnVuY3Rpb258bnVsbH0gVGhlIHJlbW92ZWQgbWV0aG9kIGlmIGZvdW5kLCBgbnVsbGAgb3RoZXJ3aXNlLlxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqL1xuICByZW1vdmUobWV0aG9kKSB7XG4gICAgaWYgKHR5cGVvZiBtZXRob2QgIT09ICdmdW5jdGlvbicpIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGluZGV4ID0gZmluZEluZGV4KHRoaXMucXVldWUsICh7IG1ldGhvZDogZW5xdWV1ZWQgfSkgPT4gZW5xdWV1ZWQgPT09IG1ldGhvZCk7XG4gICAgcmV0dXJuIGluZGV4ICE9PSAtMSA/IGdldEV4cG9ydGFibGVRdWV1ZU9iamVjdCh0aGlzLnF1ZXVlLnNwbGljZShpbmRleCwgMSlbMF0pIDogbnVsbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBQYXVzZXMgdGhlIHF1ZXVlLlxuICAgKiBAcmV0dXJucyB7UHJvbWlzZVF1ZXVlfSBUaGUgY3VycmVudCBQcm9taXNlUXVldWUgaW5zdGFuY2UgZm9yIGNoYWluaW5nLlxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqL1xuICBwYXVzZSgpIHtcbiAgICB0aGlzLmlzUGF1c2VkID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXN1bWVzIHRoZSBxdWV1ZS5cbiAgICogQHJldHVybnMge1Byb21pc2VRdWV1ZX0gVGhlIGN1cnJlbnQgUHJvbWlzZVF1ZXVlIGluc3RhbmNlIGZvciBjaGFpbmluZy5cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgcmVzdW1lKCkge1xuICAgIGlmICh0aGlzLmlzUGF1c2VkKSB7XG4gICAgICB0aGlzLmlzUGF1c2VkID0gZmFsc2U7XG4gICAgICB0aGlzLnRpY2soKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxufTtcbiJdfQ==
