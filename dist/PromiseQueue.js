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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9Qcm9taXNlUXVldWUuanMiXSwibmFtZXMiOlsiSVNfUFJPTUlTRV9RVUVVRV9QUk9NSVNFIiwiUElDS19GUk9NX0VOUVVFVUVEIiwiTkFUSVZFU19QUk9UT1RZUEVTIiwiT2JqZWN0IiwiZ2V0UHJvdG90eXBlT2YiLCJBcnJheSIsIlN0cmluZyIsIk51bWJlciIsIkJvb2xlYW4iLCJGdW5jdGlvbiIsIk5BVElWRVMiLCJjYXBpdGFsaXplIiwicyIsImNoYXJBdCIsInRvVXBwZXJDYXNlIiwic2xpY2UiLCJpbnZva2VBbGxXaXRoQXJndW1lbnRzIiwibWV0aG9kcyIsImFyZ3MiLCJmb3JFYWNoIiwibWV0aG9kIiwiaW52b2tlck9mQWxsV2l0aEFyZ3VtZW50cyIsInByaW9yaXR5U29ydEZJRk8iLCJhIiwiYiIsImRpZmZlcmVuY2UiLCJwcmlvcml0eSIsImRlcHJpb3JpdGl6ZWQiLCJpbmRleE9mIiwicHVzaCIsInByaW9yaXR5U29ydExJRk8iLCJmaW5kSW5kZXgiLCJjb2xsZWN0aW9uIiwiaXRlcmF0ZWUiLCJpbmRleCIsInNvbWUiLCJpdGVtIiwia2V5IiwicGljayIsInNvdXJjZSIsInByb3BlcnRpZXMiLCJyZXN1bHQiLCJwcm9wZXJ0eSIsImtleUZvclF1ZXVlaWZpZWRNZXRob2QiLCJtZXRob2ROYW1lIiwicHJlZml4Iiwic3VmZml4IiwiZ2V0RXhwb3J0YWJsZVF1ZXVlT2JqZWN0IiwiZGVxdWV1ZWQiLCJyZXNvbHZlIiwicmVzb2x2ZXJzIiwicmVqZWN0IiwicmVqZWN0b3JzIiwib25RdWV1ZUl0ZW1SZWR1Y3Rpb24iLCJoYW5kbGVRdWV1ZVJlZHVjdGlvbiIsInJlZHVjZWRRdWV1ZSIsImN1cnJlbnQiLCJxdWV1ZSIsInByZXZpb3VzIiwiZHJvcHBlZCIsImNvbWJpbmVkIiwiZHJvcCIsImNvbWJpbmUiLCJFcnJvciIsInByZXYiLCJjdXJyIiwiZm9yRWFjaE93bkFuZEluaGVyaXRlZEZ1bmN0aW9uIiwib2JqZWN0IiwiaGFuZGxlZCIsInZpc2l0ZWQiLCJnZXRPd25Qcm9wZXJ0eU5hbWVzIiwidmFsdWUiLCJjb25zdHJ1Y3RvciIsIm1vZHVsZSIsImV4cG9ydHMiLCJQcm9taXNlUXVldWUiLCJjb250ZXh0IiwiVHlwZUVycm9yIiwiZW5xdWV1ZSIsInByaW9yaXRpZXMiLCJhc3NpZ25RdWV1ZUFzUHJvcGVydHkiLCJpc0V4dGVuc2libGUiLCJ0YXJnZXQiLCJmdW5jdGlvbnMiLCJxdWV1ZWlmeSIsImxpZm8iLCJvblF1ZXVlRHJhaW5lZCIsIm9uTWV0aG9kRW5xdWV1ZWQiLCJtYXhDb25jdXJyZW5jeSIsIm9uTWV0aG9kRGVwcmlvcml0aXplZCIsInJ1bm5pbmciLCJpc0RyYWluZWQiLCJpc1BhdXNlZCIsInNldE1heENvbmN1cnJlbmN5IiwicHJpb3JpdHlTb3J0TW9kZSIsIk1hdGgiLCJtYXgiLCJ0aWNrIiwibGVuZ3RoIiwib25NZXRob2RTdGFydGVkIiwicmV0dXJuZWQiLCJjYWxsIiwiZSIsIm9uTWV0aG9kQ29tcGxldGVkIiwiUHJvbWlzZSIsImNhdGNoIiwidGhlbiIsInJlc3VsdHMiLCJzb3J0ZXIiLCJzb3J0IiwiZW5xdWV1ZWQiLCJwcmlvIiwicmVkdWNlIiwib3B0aW9ucyIsImVucXVldWVkTWV0aG9kUHJvbWlzZSIsInByaW9yaXRpemVRdWV1ZSIsInJlZHVjZVF1ZXVlIiwidW5kZWZpbmVkIiwibWFwIiwidmFsdWVzIiwic3BsaWNlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFBQTs7Ozs7Ozs7Ozs7OztBQWFBOzs7OztBQUtBLElBQU1BLDJCQUEyQiw4QkFBakM7O0FBRUE7Ozs7O0FBS0EsSUFBTUMscUJBQXFCLENBQUMsTUFBRCxFQUFTLFFBQVQsRUFBbUIsVUFBbkIsRUFBK0IsU0FBL0IsQ0FBM0I7O0FBRUE7Ozs7OztBQU1BLElBQU1DLHFCQUFxQixDQUN6QkMsT0FBT0MsY0FBUCxDQUFzQkQsTUFBdEIsQ0FEeUIsRUFFekJBLE9BQU9DLGNBQVAsQ0FBc0JDLEtBQXRCLENBRnlCLEVBR3pCRixPQUFP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Q0EsYUFBT2MsVUFBVSxDQUFDLENBQVgsR0FBZWEseUJBQXlCLEtBQUtVLEtBQUwsQ0FBVytELE1BQVgsQ0FBa0J0RixLQUFsQixFQUF5QixDQUF6QixFQUE0QixDQUE1QixDQUF6QixDQUFmLEdBQTBFLElBQWpGO0FBQ0Q7O0FBRUQ7Ozs7OztBQTVWRjtBQUFBO0FBQUEsNEJBaVdVO0FBQ04sV0FBSzBELFFBQUwsR0FBZ0IsSUFBaEI7QUFDQSxhQUFPLElBQVA7QUFDRDs7QUFFRDs7Ozs7O0FBdFdGO0FBQUE7QUFBQSw2QkEyV1c7QUFDUCxVQUFJLEtBQUtBLFFBQVQsRUFBbUI7QUFDakIsYUFBS0EsUUFBTCxHQUFnQixLQUFoQjtBQUNBLGFBQUtLLElBQUw7QUFDRDs7QUFFRCxhQUFPLElBQVA7QUFDRDtBQWxYSDtBQUFBO0FBQUEsd0JBK0hhO0FBQ1QsYUFBTyxLQUFLeEMsS0FBTCxDQUFXeUMsTUFBbEI7QUFDRDs7QUFFRDs7Ozs7O0FBbklGO0FBQUE7QUFBQSx3QkF3SWE7QUFDVCxhQUFPLEtBQUtwQixPQUFaO0FBQ0Q7QUExSUg7O0FBQUE7QUFBQSIsImZpbGUiOiJQcm9taXNlUXVldWUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEEgaGlnaGx5IGZsZXhpYmxlIHF1ZXVlIHRoYXQgcnVucyBgbWF4Q29uY3VycmVuY3lgIG1ldGhvZHMgYXQgYSB0aW1lXG4gKiBhbmQgd2FpdHMgZm9yIGVhY2ggbWV0aG9kIHRvIHJlc29sdmUgYmVmb3JlIGNhbGxpbmcgdGhlIG5leHQuXG4gKlxuICogU3VwcG9ydCBmb3IgcXVldWUgcGF1c2luZywgcHJpb3JpdGl6YXRpb24sIHJlZHVjdGlvbiBhbmQgYm90aCBGSUZPIGFuZCBMSUZPIG1vZGVzLlxuICogV29ya3MgaW4gYm90aCBicm93c2VycyBhbmQgbm9kZS5qcy5cbiAqXG4gKiBSZXF1aXJlbWVudHM6IFByb21pc2Ugc3VwcG9ydC9wb2x5ZmlsbFxuICogQGF1dGhvciBKYXNvbiBQb2xsbWFuIDxqYXNvbmpwb2xsbWFuQGdtYWlsLmNvbT5cbiAqIEBzaW5jZSAzLzE1LzE4XG4gKiBAZmlsZVxuICovXG5cbi8qKlxuICogQXNzaWduZWQgdG8gZXZlcnkgcHJvbWlzZSByZXR1cm5lZCBmcm9tIFByb21pc2VRdWV1ZSNlbnF1ZXVlXG4gKiB0byBlbnN1cmUgdGhlIHVzZXIgaXNuJ3QgcmV0dXJuaW5nIGFub3RoZXIgcW5ldWV1ZWQgcHJvbWlzZS5cbiAqIEB0eXBlIHtzdHJpbmd9XG4gKi9cbmNvbnN0IElTX1BST01JU0VfUVVFVUVfUFJPTUlTRSA9ICdfX0lTX1BST01JU0VfUVVFVUVfUFJPTUlTRV9fJztcblxuLyoqXG4gKiBUaGUgcHJvcGVydGllcyBwaWNrZWQgZnJvbSBlYWNoIGVucXVldWVkIGl0ZW0gd2hlblxuICogcGFzc2VkIHRvIHVzZXIgbWV0aG9kcyAoZm9yIGVuY2Fwc3VsYXRpb24gYW5kIHRvIHByZXZlbnQgbXV0YXRpb24pLlxuICogQHR5cGUge0FycmF5PHN0cmluZz59XG4gKi9cbmNvbnN0IFBJQ0tfRlJPTV9FTlFVRVVFRCA9IFsnYXJncycsICdtZXRob2QnLCAncHJpb3JpdHknLCAnY29udGV4dCddO1xuXG4vKipcbiAqIE5hdGl2ZSBwcm90b3R5cGUgcHJvcGVydGllcy5cbiAqIFRoaXMgaXMgdGhlIHNldCBvZiBwcm90b3R5cGVzIHdoaWNoIHdlIGRvbid0IHdhbnQgdG8gcXVldWVpZnkgd2hlbiBydW5uaW5nXG4gKiBgcXVldWVpZnlBbGxgIG9uIGFuIG9iamVjdCBhbmQgd2Fsa2luZyBpdCdzIHByb3RvdHlwZSBjaGFpbi5cbiAqIEB0eXBlIHtBcnJheTxvYmplY3Q+fVxuICovXG5jb25zdCBOQVRJVkVTX1BST1RPVFlQRVMgPSBbXG4gIE9iamVjdC5nZXRQcm90b3R5cGVPZihPYmplY3QpLFxuICBPYmplY3QuZ2V0UHJvdG90eXBlT2YoQXJyYXkpLFxuICBPYmplY3QuZ2V0UHJvdG90eXBlT2YoU3RyaW5nKSxcbiAgT2JqZWN0LmdldFByb3RvdHlwZU9mKE51bWJlciksXG4gIE9iamVjdC5nZXRQcm90b3R5cGVPZihCb29sZWFuKSxcbiAgT2JqZWN0LmdldFByb3RvdHlwZU9mKEZ1bmN0aW9uKSxcbl07XG5cbmNvbnN0IE5BVElWRVMgPSBbXG4gIE9iamVjdCxcbiAgQXJyYXksXG4gIFN0cmluZyxcbiAgTnVtYmVyLFxuICBCb29sZWFuLFxuICBGdW5jdGlvbixcbl07XG5cbi8qKlxuICogQ2FwaXRhbGl6ZXMgdGhlIGZpcnN0IGNoYXJhY3RlciBvZiBhIHN0cmluZy5cbiAqIEBwYXJhbSB7c3RyaW5nfSBzIFRoZSBzdHJpbmcgdG8gY2FwaXRhbGl6ZS5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFRoZSBjYXBpdGFsaXplZCBzdHJpbmcuXG4gKi9cbmNvbnN0IGNhcGl0YWxpemUgPSBzID0+IHMuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBzLnNsaWNlKDEpO1xuXG4vKipcbiAqIEludm9rZXMgdGhlIGdpdmVuIGFycmF5IG9mIGZ1bmN0aW9ucyB3aXRoIHRoZSBnaXZlbiBhcnJheSBvZiBhcmd1bWVudHMuXG4gKiBAcGFyYW0ge0FycmF5PGZ1bmN0aW9uPn0gbWV0aG9kcyBBbiBhcnJheSBvZiBtZXRob2RzIHRvIGludm9rZS5cbiAqIEBwYXJhbSB7QXJyYXl9IGFyZ3MgVGhlIGFyZ3VtZW50cyB0byBpbnZva2UgdGhlIG1ldGhvZCB3aXRoLlxuICogQHJldHVybnMge3VuZGVmaW5lZH1cbiAqL1xuY29uc3QgaW52b2tlQWxsV2l0aEFyZ3VtZW50cyA9IChtZXRob2RzLCBhcmdzKSA9PiBtZXRob2RzLmZvckVhY2gobWV0aG9kID0+IG1ldGhvZCguLi5hcmdzKSk7XG5cbi8qKlxuICogQ3VycmllZCB2ZXJzaW9uIG9mIGBpbnZva2VBbGxXaXRoQXJndW1lbnRzYC5cbiAqIEBwYXJhbSB7QXJyYXk8ZnVuY3Rpb24+fSBtZXRob2RzIEFuIGFycmF5IG9mIG1ldGhvZHMgdG8gaW52b2tlLlxuICogQHJldHVybnMge3VuZGVmaW5lZH1cbiAqL1xuY29uc3QgaW52b2tlck9mQWxsV2l0aEFyZ3VtZW50cyA9IG1ldGhvZHMgPT4gKC4uLmFyZ3MpID0+IGludm9rZUFsbFdpdGhBcmd1bWVudHMobWV0aG9kcywgYXJncyk7XG5cbi8qKlxuICogUmV0dXJucyBhIGZ1bmN0aW9uIHVzZWQgYnkgQXJyYXkjc29ydCB0byBzb3J0IHF1ZXVlcyBieSBwcmlvcml0eSBpbiBmaWZvIG1vZGUuXG4gKiBAcGFyYW0ge0FycmF5fSBkZXByaW9yaXRpemVkIENvbGxlY3RzIGRlcHJpb3JpdGl6ZWQgZW5xdWV1ZWQgaXRlbXMuXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBBIHNvcnQgcmVzdWx0IHZhbHVlLlxuICovXG5jb25zdCBwcmlvcml0eVNvcnRGSUZPID0gZGVwcmlvcml0aXplZCA9PiAoYSwgYikgPT4ge1xuICBjb25zdCBkaWZmZXJlbmNlID0gTnVtYmVyKGIucHJpb3JpdHkpIC0gTnVtYmVyKGEucHJpb3JpdHkpO1xuICBpZiAoZGlmZmVyZW5jZSA+IDAgJiYgZGVwcmlvcml0aXplZC5pbmRleE9mKGEpID09PSAtMSkgZGVwcmlvcml0aXplZC5wdXNoKGEpO1xuICByZXR1cm4gZGlmZmVyZW5jZTtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIGZ1bmN0aW9uIHVzZWQgYnkgQXJyYXkjc29ydCB0byBzb3J0IHF1ZXVlcyBieSBwcmlvcml0eSBpbiBsaWZvIG1vZGUuXG4gKiBAcGFyYW0ge0FycmF5fSBkZXByaW9yaXRpemVkIENvbGxlY3RzIGRlcHJpb3JpdGl6ZWQgZW5xdWV1ZWQgaXRlbXMuXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBBIHNvcnQgcmVzdWx0IHZhbHVlLlxuICovXG5jb25zdCBwcmlvcml0eVNvcnRMSUZPID0gZGVwcmlvcml0aXplZCA9PiAoYSwgYikgPT4ge1xuICBjb25zdCBkaWZmZXJlbmNlID0gTnVtYmVyKGEucHJpb3JpdHkpIC0gTnVtYmVyKGIucHJpb3JpdHkpO1xuICBpZiAoZGlmZmVyZW5jZSA8IDAgJiYgZGVwcmlvcml0aXplZC5pbmRleE9mKGEpID09PSAtMSkgZGVwcmlvcml0aXplZC5wdXNoKGEpO1xuICByZXR1cm4gZGlmZmVyZW5jZTtcbn07XG5cbi8qKlxuICogU2ltaWxhciB0byBBcnJheSNmaW5kSW5kZXggKHdoaWNoIGlzIHVuc3VwcG9ydGVkIGJ5IElFKS5cbiAqIEBwYXJhbSB7QXJyYXl9IGNvbGxlY3Rpb24gVGhlIGNvbGxlY3Rpb24gdG8gZmluZCBhbiBpbmRleCB3aXRoaW4uXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBpdGVyYXRlZSBUaGUgZnVuY3Rpb24gdG8gaW52b2tlIGZvciBlYWNoIGl0ZW0uXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBUaGUgaW5kZXggb2YgdGhlIGZvdW5kIGl0ZW0sIG9yIC0xLlxuICovXG5mdW5jdGlvbiBmaW5kSW5kZXgoY29sbGVjdGlvbiwgaXRlcmF0ZWUpIHtcbiAgbGV0IGluZGV4ID0gLTE7XG5cbiAgY29sbGVjdGlvbi5zb21lKChpdGVtLCBrZXkpID0+IHtcbiAgICBpZiAoIWl0ZXJhdGVlKGl0ZW0sIGtleSwgY29sbGVjdGlvbikpIHJldHVybiBmYWxzZTtcbiAgICBpbmRleCA9IGtleTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSk7XG5cbiAgcmV0dXJuIGluZGV4O1xufVxuXG4vKipcbiAqIEEgc2ltcGxpZmllZCB2ZXJzaW9uIGxvZGFzaCdzIHBpY2suXG4gKiBAcGFyYW0ge29iamVjdH0gc291cmNlIFRoZSBzb3VyY2Ugb2JqZWN0IHRvIHBpY2sgdGhlIHByb3BlcnRpZXMgZnJvbS5cbiAqIEBwYXJhbSB7QXJyYXk8c3RyaW5nPn0gcHJvcGVydGllcyBUaGUgcHJvcGVydGllcyB0byBwaWNrIGZyb20gdGhlIG9iamVjdC5cbiAqIEByZXR1cm5zIHtvYmplY3R9IEEgbmV3IG9iamVjdCBjb250YWluaW5nIHRoZSBzcGVjaWZpZWQgcHJvcGVydGllcy5cbiAqL1xuZnVuY3Rpb24gcGljayhzb3VyY2UsIHByb3BlcnRpZXMpIHtcbiAgY29uc3QgcmVzdWx0ID0ge307XG4gIHByb3BlcnRpZXMuZm9yRWFjaCgocHJvcGVydHkpID0+IHsgcmVzdWx0W3Byb3BlcnR5XSA9IHNvdXJjZVtwcm9wZXJ0eV07IH0pO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIGZ1bmN0aW9uIG5hbWUgZm9yIGEgcXVldWVpZmllZCBtZXRob2QgKHVzaW5nIHByZWZpeCBhbmQgc3VmZml4KS5cbiAqIEBwYXJhbSB7c3RyaW5nfSBtZXRob2ROYW1lIFRoZSBuYW1lIG9mIHRoZSBtZXRob2QgdG8gZ2V0IHRoZSBxdWV1ZWlmeSBrZXkgb2YuXG4gKiBAcGFyYW0ge3N0cmluZ30gcHJlZml4IFRoZSBrZXkgcHJlZml4LlxuICogQHBhcmFtIHtzdHJpbmd9IHN1ZmZpeCBUaGUga2V5IHN1ZmZpeC5cbiAqIEByZXR1cm5zIHtzdHJpbmd9IFRoZSBxdWV1ZWlmaWVkIGZ1bmN0aW9uIG5hbWUgb2YgXCJtZXRob2ROYW1lXCIuXG4gKi9cbmZ1bmN0aW9uIGtleUZvclF1ZXVlaWZpZWRNZXRob2QobWV0aG9kTmFtZSwgcHJlZml4LCBzdWZmaXgpIHtcbiAgcmV0dXJuIGAke3ByZWZpeH0ke2NhcGl0YWxpemUobWV0aG9kTmFtZSl9JHtjYXBpdGFsaXplKHN1ZmZpeCl9YDtcbn1cblxuLyoqXG4gKiBUaGUgbWFzc2FnZWQgZGVxdWV1ZWQgb2JqZWN0IHJldHVybmVkIGZyb20gUHJvbWlzZVF1ZXVlI2NsZWFyIGFuZCBQcm9taXNlUXVldWUjcmVtb3ZlLlxuICogQHBhcmFtIHtvYmplY3R9IGRlcXVldWVkIEFuIG9iamVjdCBkZXF1ZXVlZCBmcm9tIHRoZSBxdWV1ZS5cbiAqIEByZXR1cm5zIHtvYmplY3R9IFRoZSBleHBvcnRhYmxlIHF1ZXVlIG9iamVjdC5cbiAqL1xuZnVuY3Rpb24gZ2V0RXhwb3J0YWJsZVF1ZXVlT2JqZWN0KGRlcXVldWVkKSB7XG4gIHJldHVybiB7XG4gICAgLi4ucGljayhkZXF1ZXVlZCwgUElDS19GUk9NX0VOUVVFVUVEKSxcbiAgICByZXNvbHZlOiBpbnZva2VyT2ZBbGxXaXRoQXJndW1lbnRzKGRlcXVldWVkLnJlc29sdmVycyksXG4gICAgcmVqZWN0OiBpbnZva2VyT2ZBbGxXaXRoQXJndW1lbnRzKGRlcXVldWVkLnJlamVjdG9ycyksXG4gIH07XG59XG5cbi8qKlxuICogVXNlZCBieSBBcnJheS5wcm90b3R5cGUucmVkdWNlIHRvIHJlZHVjZSB0aGUgcXVldWUgdXNpbmcgdGhlIHVzZXInc1xuICogYGhhbmRsZVF1ZXVlUmVkdWN0aW9uYCBtZXRob2QuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBoYW5kbGVRdWV1ZVJlZHVjdGlvbiBUaGUgdXNlcidzIGBoYW5kbGVRdWV1ZVJlZHVjdGlvbmAgbWV0aG9kLlxuICogQHJldHVybnMge2Z1bmN0aW9ufSBBIHF1ZXVlIHJlZHVjZXIsIGdpdmVuIGEgcmVkdWNlciBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gb25RdWV1ZUl0ZW1SZWR1Y3Rpb24oaGFuZGxlUXVldWVSZWR1Y3Rpb24pIHtcbiAgcmV0dXJuIChyZWR1Y2VkUXVldWUsIGN1cnJlbnQsIGluZGV4LCBxdWV1ZSkgPT4ge1xuICAgIGNvbnN0IHByZXZpb3VzID0gcXVldWVbaW5kZXggLSAxXSB8fCBudWxsO1xuXG4gICAgbGV0IGRyb3BwZWQgPSBmYWxzZTtcbiAgICBsZXQgY29tYmluZWQgPSBmYWxzZTtcblxuICAgIC8vIERyb3BzIHRoZSBlbnF1ZXVlZCBtZXRob2QgY2FsbC5cbiAgICAvLyBXYXJuaW5nOiB0aGlzIHdpbGwgY2F1c2UgcHJvbWlzZXMgdG8gbmV2ZXIgcmVzb2x2ZS4gRm9yIHRoYXRcbiAgICAvLyByZWFzb24sIHRoaXMgbWV0aG9kIHJldHVybnMgdGhlIHJlamVjdG9ycyBhbmQgcmVzb2x2ZXJzLlxuICAgIGNvbnN0IGRyb3AgPSAoKSA9PiB7XG4gICAgICBkcm9wcGVkID0gdHJ1ZTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJlc29sdmU6IGludm9rZXJPZkFsbFdpdGhBcmd1bWVudHMoY3VycmVudC5yZXNvbHZlcnMpLFxuICAgICAgICByZWplY3Q6IGludm9rZXJPZkFsbFdpdGhBcmd1bWVudHMoY3VycmVudC5yZWplY3RvcnMpLFxuICAgICAgfTtcbiAgICB9O1xuXG4gICAgLy8gQ29tYmluZXMgdGhlIHByZXZpb3VzIGFuZCBjdXJyZW50IGVucXVldWVkIG1ldGhvZHMuXG4gICAgLy8gVGhpcyBkb2Vzbid0IGNvbWJpbmUgdGhlIGZ1bmN0aW9uYWxpdHksIGJ1dCBwYXNzZXNcbiAgICAvLyBhbGwgb2YgdGhlIHJlc29sdmVycyBhbmQgcmVqZWN0b3JzIHRvIHRoZSBwcmV2aW91c1xuICAgIC8vIG1ldGhvZCBpbnZvY2F0aW9uIGFuZCBkcm9wcyB0aGUgY3VycmVudCBvbmUgKGVmZmVjdGl2ZWx5XG4gICAgLy8gXCJjb21iaW5pbmdcIiB0aGUgY2FsbCBpbnRvIGEgc2luZ2xlIG9uZSkuXG4gICAgY29uc3QgY29tYmluZSA9ICgpID0+IHtcbiAgICAgIGlmICghcHJldmlvdXMpIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGNvbWJpbmUgcXVldWVkIG1ldGhvZCBjYWxscyB3aXRob3V0IGEgcHJldmlvdXMgdmFsdWUuJyk7XG4gICAgICBjb21iaW5lZCA9IHRydWU7XG4gICAgfTtcblxuICAgIGNvbnN0IHByZXYgPSBwcmV2aW91cyAmJiBwaWNrKHByZXZpb3VzLCBQSUNLX0ZST01fRU5RVUVVRUQpO1xuICAgIGNvbnN0IGN1cnIgPSBwaWNrKGN1cnJlbnQsIFBJQ0tfRlJPTV9FTlFVRVVFRCk7XG4gICAgaGFuZGxlUXVldWVSZWR1Y3Rpb24ocHJldiwgY3VyciwgY29tYmluZSwgZHJvcCk7XG5cbiAgICBpZiAoY29tYmluZWQgJiYgZHJvcHBlZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgYm90aCBjb21iaW5lIGFuZCBkcm9wIGFuIGVucXVldWVkIG1ldGhvZCBjYWxsLicpO1xuICAgIH1cblxuICAgIC8vIElmIHRoZSBjYWxscyB3ZXJlIFwiY29tYmluZWRcIiwgcGFzcyB0aGUgcmVzb2x2ZXJzIGFuZCByZWplY3RvcnNcbiAgICAvLyBvZiB0aGUgY3VycmVudCBtZXRob2QgdG8gdGhlIHByZXZpb3VzIG9uZS4gSWYgaXQgd2Fzbid0IGRyb3BwZWRcbiAgICAvLyBrZWVwIHRoZSBjdXJyZW50IG1ldGhvZCBpbiB0aGUgcXVldWUuXG4gICAgaWYgKGNvbWJpbmVkKSB7XG4gICAgICBwcmV2aW91cy5yZXNvbHZlcnMucHVzaCguLi5jdXJyZW50LnJlc29sdmVycyk7XG4gICAgICBwcmV2aW91cy5yZWplY3RvcnMucHVzaCguLi5jdXJyZW50LnJlamVjdG9ycyk7XG4gICAgfSBlbHNlIGlmICghZHJvcHBlZCkge1xuICAgICAgcmVkdWNlZFF1ZXVlLnB1c2goY3VycmVudCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlZHVjZWRRdWV1ZTtcbiAgfTtcbn1cblxuLyoqXG4gKiBJdGVyYXRlcyBhbiBvYmplY3QncyBvd24gYW5kIGluaGVyaXRlZCBmdW5jdGlvbnMgYW5kIHdhbGtzIHRoZSBwcm90b3R5cGUgY2hhaW4gdW50aWxcbiAqIE9iamVjdC5wcm90b3R5cGUgaXMgcmVhY2hlZC4gVGhpcyB3aWxsIGJlIHVzZWQgdG8gcXVldWVpZnkgaW5oZXJpdGVkIGZ1bmN0aW9ucyBiZWxvdy5cbiAqIEBwYXJhbSB7b2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBjYWxsIGBpdGVyYXRlZWAgb24gZm9yIGVhY2ggb3duIGFuZCBpbmhlcml0ZWQgcHJvcGVydHkuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBpdGVyYXRlZSBUaGUgY2FsbGJhY2sgdG8gaW52b2tlIGZvciBlYWNoIHByb3BlcnR5LlxuICogQHBhcmFtIHtvYmplY3R9IGhhbmRsZWQgS2VlcHMgdHJhY2sgb2YgcHJvcGVydGllcyB0aGF0IGhhdmUgYWxyZWFkeSBiZWVuIHF1ZXVlaWZpZWRcbiAqIGxvd2VyIGRvd24gaW4gdGhlIHByb3RvdHlwZSBjaGFpbiB0byBwcmV2ZW50IG92ZXJ3cml0aW5nIHByZXZpb3VzIHF1ZXVlaWZpY2F0aW9ucy5cbiAqIEByZXR1cm5zIHt1bmRlZmluZWR9XG4gKi9cbmZ1bmN0aW9uIGZvckVhY2hPd25BbmRJbmhlcml0ZWRGdW5jdGlvbihvYmplY3QsIGl0ZXJhdGVlLCBoYW5kbGVkID0ge30pIHtcbiAgLy8gRG9uJ3QgcHJvbWlzaWZ5IG5hdGl2ZSBwcm90b3R5cGUgcHJvcGVydGllcy5cbiAgaWYgKCFvYmplY3QgfHwgTkFUSVZFU19QUk9UT1RZUEVTLmluZGV4T2Yob2JqZWN0KSA+IC0xKSByZXR1cm47XG4gIGNvbnN0IHZpc2l0ZWQgPSBoYW5kbGVkO1xuXG4gIC8vIEl0ZXJhdGUgdGhlIG9iamVjdCdzIG93biBwcm9wZXJ0aWVzXG4gIE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKG9iamVjdCkuZm9yRWFjaCgocHJvcGVydHkpID0+IHtcbiAgICBpZiAodmlzaXRlZFtwcm9wZXJ0eV0pIHJldHVybjtcbiAgICB2aXNpdGVkW3Byb3BlcnR5XSA9IHRydWU7XG5cbiAgICBjb25zdCB2YWx1ZSA9IG9iamVjdFtwcm9wZXJ0eV07XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ2Z1bmN0aW9uJyB8fCBwcm9wZXJ0eSA9PT0gJ2NvbnN0cnVjdG9yJykgcmV0dXJuO1xuICAgIGl0ZXJhdGVlKHZhbHVlLCBwcm9wZXJ0eSk7XG4gIH0pO1xuXG4gIC8vIEl0ZXJhdGUgdGhlIG9iamVjdCdzIGNvbnN0cnVjdG9yIHByb3BlcnRpZXMgKHN0YXRpYyBwcm9wZXJ0aWVzKVxuICBpZiAoTkFUSVZFUy5pbmRleE9mKG9iamVjdC5jb25zdHJ1Y3RvcikgPT09IC0xKSB7XG4gICAgT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMob2JqZWN0LmNvbnN0cnVjdG9yKS5mb3JFYWNoKChwcm9wZXJ0eSkgPT4ge1xuICAgICAgaWYgKHZpc2l0ZWRbcHJvcGVydHldKSByZXR1cm47XG4gICAgICB2aXNpdGVkW3Byb3BlcnR5XSA9IHRydWU7XG5cbiAgICAgIGNvbnN0IHZhbHVlID0gb2JqZWN0LmNvbnN0cnVjdG9yW3Byb3BlcnR5XTtcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT09ICdmdW5jdGlvbicgfHwgcHJvcGVydHkgPT09ICdwcm90b3R5cGUnKSByZXR1cm47XG4gICAgICBpdGVyYXRlZSh2YWx1ZSwgcHJvcGVydHkpO1xuICAgIH0pO1xuICB9XG5cbiAgZm9yRWFjaE93bkFuZEluaGVyaXRlZEZ1bmN0aW9uKE9iamVjdC5nZXRQcm90b3R5cGVPZihvYmplY3QpLCBpdGVyYXRlZSwgdmlzaXRlZCk7XG59XG5cbi8qKlxuICogQSBxdWV1ZSB0aGF0IHJ1bnMgb25seSBgbWF4Q29uY3VycmVuY3lgIGZ1bmN0aW9ucyBhdCBhIHRpbWUsIHRoYXRcbiAqIGNhbiBhbHNvIG9wZXJhdGUgYXMgYSBzdGFjay4gSXRlbXMgaW4gdGhlIHF1ZXVlIGFyZSBkZXF1ZXVlZCBvbmNlXG4gKiBwcmV2aW91cyBmdW5jdGlvbnMgaGF2ZSBmdWxseSByZXNvbHZlZC5cbiAqIEBjbGFzcyBQcm9taXNlUXVldWVcbiAqL1xubW9kdWxlLmV4cG9ydHMgPSBjbGFzcyBQcm9taXNlUXVldWUge1xuICAvKipcbiAgICogV29ya3MgbGlrZSBCbHVlYmlyZCdzIFByb21pc2UucHJvbWlzaWZ5LlxuICAgKiBHaXZlbiBhIGZ1bmN0aW9uLCB0aGlzIHdpbGwgcmV0dXJuIGEgd3JhcHBlciBmdW5jdGlvbiB0aGF0IGVucXVldWUncyBhIGNhbGxcbiAgICogdG8gdGhlIGZ1bmN0aW9uIHVzaW5nIGVpdGhlciB0aGUgcHJvdmlkZWQgUHJvbWlzZVF1ZXVlIGlzbnRhbmNlIG9yIGEgbmV3IG9uZS5cbiAgICogQHBhcmFtIHtmdW5jdGlvbn0gbWV0aG9kIFRoZSBtZXRob2QgdG8gcXVldWVpZnkuXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zIFF1ZXVlaWZpY2F0aW9uIG9wdGlvbnMuXG4gICAqIEBwYXJhbSB7UHJvbWlzZVF1ZXVlPX0gb3B0aW9ucy5xdWV1ZSBUaGUgcXVldWUgdGhlIHdyYXBwZXIgZnVuY3Rpb24gd2lsbCBvcGVyYXRlIHVzaW5nLlxuICAgKiBAcGFyYW0ge2FueX0gb3B0aW9ucy5jb250ZXh0IFRoZSB2YWx1ZSBmb3IgYHRoaXNgIGluIHRoZSBxdWV1ZWlmaWVkIGZ1bmN0aW9uLlxuICAgKiBAcmV0dXJucyB7ZnVuY3Rpb259IFRoZSBxdWV1ZWlmaWVkIHZlcnNpb24gb2YgdGhlIGZ1bmN0aW9uLlxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqIEBzdGF0aWNcbiAgICovXG4gIHN0YXRpYyBxdWV1ZWlmeShtZXRob2QsIHtcbiAgICBxdWV1ZSA9IG5ldyBQcm9taXNlUXVldWUoKSxcbiAgICBjb250ZXh0ID0gcXVldWUsXG4gICAgcHJpb3JpdHkgPSAwLFxuICB9ID0ge30pIHtcbiAgICBpZiAodHlwZW9mIG1ldGhvZCAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcbiAgICAgICAgJ1lvdSBtdXN0IHBhc3MgYSBmdW5jdGlvbiBmb3IgcGFyYW1ldGVyIFwibWV0aG9kXCIgdG8gcXVldWVpZnkuJyxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKCEocXVldWUgaW5zdGFuY2VvZiBQcm9taXNlUXVldWUpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgICAnUHJvbWlzZVF1ZXVlLnF1ZXVlaWZ5IGV4cGVjdGVkIGFuIGluc3RhbmNlIG9mIFByb21pc2VRdWV1ZSBmb3IgcGFyYW1ldGVyIFwicXVldWVcIi4nLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gKC4uLmFyZ3MpID0+IHF1ZXVlLmVucXVldWUobWV0aG9kLCB7IGFyZ3MsIGNvbnRleHQsIHByaW9yaXR5IH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFdvcmtzIGxpa2UgQmx1ZWJpcmQncyBQcm9taXNlLnByb21pc2lmeUFsbC5cbiAgICogR2l2ZW4gYW4gb2JqZWN0LCB0aGlzIG1ldGhvZCB3aWxsIGNyZWF0ZSBhIG5ldyBcInF1ZXVlZFwiIHZlcnNpb24gb2YgZWFjaCBmdW5jdGlvblxuICAgKiBvbiB0aGUgb2JqZWN0IGFuZCBhc3NpZ24gaXQgdG8gdGhlIG9iamVjdCBhcyBbcHJlZml4XVttZXRob2QgbmFtZV1bc3VmZml4XSAoY2FtZWwgY2FzZWQpLlxuICAgKiBBbGwgY2FsbHMgdG8gdGhlIHF1ZXVlZCB2ZXJzaW9uIHdpbGwgdXNlIFByb21pc2VRdWV1ZSNlbnF1ZXVlLlxuICAgKiAqTm90ZSogVGhpcyB3aWxsIG11dGF0ZSB0aGUgcGFzc2VkIGluIG9iamVjdC5cbiAgICogQHBhcmFtIHtvYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIGNyZWF0ZSBuZXcgcXVlaWZpZWQgZnVuY3Rpb25zIG9uLlxuICAgKiBAcGFyYW0ge29iamVjdH0gb3B0aW9ucyBRdWVpZmljYXRpb24gb3B0aW9ucy5cbiAgICogQHBhcmFtIHtzdHJpbmc9fSBvcHRpb25zLnByZWZpeCBBIHByZWZpeCBwcmVwZW5kZWQgdG8gcXVldWVpZmllZCBmdW5jdGlvbiBwcm9wZXJ0eSBuYW1lcy5cbiAgICogQHBhcmFtIHtzdHJpbmc9fSBvcHRpb25zLnN1ZmZpeCBBIHN1ZmZpeCBhcHBlbmRlZCB0byBxdWV1ZWlmaWVkIGZ1bmN0aW9uIHByb3BlcnR5IG5hbWVzLlxuICAgKiBAcGFyYW0ge29iamVjdH0gb3B0aW9ucy5wcmlvcml0aWVzIEEgbWFwcGluZyBvZiB0aGUgKm9yaWdpbmFsKiBmdW5jdGlvbiBuYW1lcyB0b1xuICAgKiBxdWV1ZSBwcmlvcml0aWVzLlxuICAgKiBAcGFyYW0ge1Byb21pc2VRdWV1ZT19IG9wdGlvbnMucXVldWUgVGhlIFByb21pc2VRdWV1ZSBpbnN0YW5jZSBmb3IgZWFjaCBmdW5jdGlvblxuICAgKiB0byBvcGVyYXRlIHVzaW5nLlxuICAgKiBAcGFyYW0ge3N0cmluZz19IGFzc2lnblF1ZXVlQXNQcm9wZXJ0eSBUaGUgcHJvcGVydHkgbmFtZSB0byBhc3NpZ24gdGhlIFByb21pc2VRdWV1ZSBpbnN0YW5jZVxuICAgKiBvbiB0aGUgb2JqZWN0IGFzLiBTZXQgdGhpcyB0byBhIGZhbHN5IHZhbHVlIHRvIG9taXQgYWRkaW5nIGEgcmVmZXJlbmNlIHRvIHRoZSBxdWV1ZS5cbiAgICogQHJldHVybnMge29iamVjdH0gVGhlIG9yaWdpbmFsbHkgcGFzc2VkIGluIG9iamVjdCB3aXRoIG5ldyBxdWV1ZWlmaWVkIGZ1bmN0aW9ucyBhdHRhY2hlZC5cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKiBAc3RhdGljXG4gICAqL1xuICBzdGF0aWMgcXVldWVpZnlBbGwob2JqZWN0LCB7XG4gICAgcHJlZml4ID0gJ3F1ZXVlZCcsXG4gICAgc3VmZml4ID0gJycsXG4gICAgcHJpb3JpdGllcyA9IHt9LFxuICAgIHF1ZXVlID0gbmV3IFByb21pc2VRdWV1ZSgpLFxuICAgIGFzc2lnblF1ZXVlQXNQcm9wZXJ0eSA9ICdxdWV1ZScsXG4gIH0gPSB7fSkge1xuICAgIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCAhT2JqZWN0LmlzRXh0ZW5zaWJsZShvYmplY3QpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBxdWV1ZWlmeSBhIG5vbi1vYmplY3Qgb3Igbm9uLWV4dGVuc2libGUgb2JqZWN0LicpO1xuICAgIH1cblxuICAgIGNvbnN0IHRhcmdldCA9IG9iamVjdDtcbiAgICBjb25zdCBmdW5jdGlvbnMgPSBbXTtcblxuICAgIC8vIEl0ZXJhdGUgb3ZlciBhbGwgb2YgdGhlIG9iamVjdCdzIG93biBhbmQgaW5oZXJpdGVkIGZ1bmN0aW9ucyBhbmQgcXVldWVpZnkgZWFjaCBtZXRob2QuXG4gICAgLy8gVGhpcyB3aWxsIGFkZCBhIG5ldyBwcm9wZXJ5IG9uIHRoZSBvYmplY3QgW3ByZWZpeF1bbWV0aG9kIG5hbWVdW3N1ZmZpeF0uXG4gICAgZm9yRWFjaE93bkFuZEluaGVyaXRlZEZ1bmN0aW9uKHRhcmdldCxcbiAgICAgICh2YWx1ZSwgcHJvcGVydHkpID0+IGZ1bmN0aW9ucy5wdXNoKHsgdmFsdWUsIHByb3BlcnR5IH0pLFxuICAgICk7XG5cbiAgICBmdW5jdGlvbnMuZm9yRWFjaCgoeyB2YWx1ZSwgcHJvcGVydHkgfSkgPT4ge1xuICAgICAgdGFyZ2V0W2tleUZvclF1ZXVlaWZpZWRNZXRob2QocHJvcGVydHksIHByZWZpeCwgc3VmZml4KV0gPSBQcm9taXNlUXVldWUucXVldWVpZnkodmFsdWUsIHtcbiAgICAgICAgcXVldWUsXG4gICAgICAgIGNvbnRleHQ6IHRhcmdldCxcbiAgICAgICAgcHJpb3JpdHk6IE51bWJlcihwcmlvcml0aWVzW3Byb3BlcnR5XSkgfHwgMCxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gU3RvcmUgb2ZmIGEgcmVmZXJlbmNlIHRvIHRoZSBvYmplY3QncyBxdWV1ZSBmb3IgdXNlciB1c2UuXG4gICAgLy8gVGhpcyBjYW4gYmUgZGlzYWJsZWQgYnkgc2V0dGluZyBgYXNzaWduUXVldWVBc1Byb3BlcnR5YCB0byBmYWxzZS5cbiAgICBpZiAodHlwZW9mIGFzc2lnblF1ZXVlQXNQcm9wZXJ0eSA9PT0gJ3N0cmluZycpIHRhcmdldFthc3NpZ25RdWV1ZUFzUHJvcGVydHldID0gcXVldWU7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGFuIGluc3RhbmNlIG9mIFByb21pc2VRdWV1ZS5cbiAgICogQHBhcmFtIHtvYmplY3R9IG9wdGlvbnMgUHJvbWlzZVF1ZXVlIGluc3RhbmNlIG9wdGlvbnMuXG4gICAqIEBwYXJhbSB7Ym9vbGVhbj19IG9wdGlvbnMubGlmbyBJZiB0cnVlLCB0aGUgaW5zdGFuY2Ugd2lsbCBvcGVyYXRlIGFzIGEgc3RhY2tcbiAgICogcmF0aGVyIHRoYW4gYSBxdWV1ZSAodXNpbmcgLnBvcCBpbnN0ZWFkIG9mIC5zaGlmdCkuXG4gICAqIEBwYXJhbSB7bnVtYmVyfSBvcHRpb25zLm1heENvbmN1cnJlbmN5IFRoZSBtYXhpbXVtIG51bWJlciBvZiBxdWV1ZSBtZXRob2RzIHRoYXQgY2FuXG4gICAqIHJ1biBjb25jdXJyZW50bHkuIERlZmF1bHRzIHRvIDEgYW5kIGlzIGNsYXBlZCB0byBbMSwgSW5maW5pZnldLlxuICAgKi9cbiAgY29uc3RydWN0b3Ioe1xuICAgIGxpZm8gPSBmYWxzZSxcbiAgICBvblF1ZXVlRHJhaW5lZCxcbiAgICBvbk1ldGhvZEVucXVldWVkLFxuICAgIG1heENvbmN1cnJlbmN5ID0gMSxcbiAgICBoYW5kbGVRdWV1ZVJlZHVjdGlvbixcbiAgICBvbk1ldGhvZERlcHJpb3JpdGl6ZWQsXG4gIH0gPSB7fSkge1xuICAgIHRoaXMucXVldWUgPSBbXTtcbiAgICB0aGlzLnJ1bm5pbmcgPSAwO1xuICAgIHRoaXMubGlmbyA9IEJvb2xlYW4obGlmbyk7XG5cbiAgICB0aGlzLmlzRHJhaW5lZCA9IGZhbHNlO1xuICAgIHRoaXMuaXNQYXVzZWQgPSBmYWxzZTtcblxuICAgIHRoaXMuaGFuZGxlUXVldWVSZWR1Y3Rpb24gPSBoYW5kbGVRdWV1ZVJlZHVjdGlvbjtcbiAgICB0aGlzLm9uTWV0aG9kRGVwcmlvcml0aXplZCA9IG9uTWV0aG9kRGVwcmlvcml0aXplZDtcblxuICAgIHRoaXMub25RdWV1ZURyYWluZWQgPSBvblF1ZXVlRHJhaW5lZDtcbiAgICB0aGlzLm9uTWV0aG9kRW5xdWV1ZWQgPSBvbk1ldGhvZEVucXVldWVkO1xuICAgIHRoaXMuc2V0TWF4Q29uY3VycmVuY3kobWF4Q29uY3VycmVuY3kpO1xuXG4gICAgLy8gQW4gb3B0aW1pemF0aW9uIHRvIHByZXZlbnQgc29ydGluZyB0aGUgcXVldWUgb24gZXZlcnkgZW5xdWV1ZVxuICAgIC8vIHVudGlsIGEgcHJpb3JpdHkgaGFzIGJlZW4gc2V0IG9uIGEgbWV0aG9kLlxuICAgIHRoaXMucHJpb3JpdHlTb3J0TW9kZSA9IGZhbHNlO1xuICB9XG5cbiAgLyoqXG4gICAqIEByZXR1cm5zIHtudW1iZXJ9IFRoZSBudW1iZXIgb2YgZW5xdWV1ZWQgaXRlbXMuXG4gICAqIEBtZW1iZXJvZiBQcm9taXNlUXVldWVcbiAgICogQHJlYWRvbmx5XG4gICAqL1xuICBnZXQgc2l6ZSgpIHtcbiAgICByZXR1cm4gdGhpcy5xdWV1ZS5sZW5ndGg7XG4gIH1cblxuICAvKipcbiAgICogQW4gYWxpYXMgZm9yIFwiZW5xdWV1ZVwiLlxuICAgKiBJZiBpbiBsaWZvIG1vZGUgdGhpcyB2ZXJiIG1pZ2h0IGJlIG1vcmUgY29ycmVjdC5cbiAgICogQHJlYWRvbmx5XG4gICAqL1xuICBnZXQgcHVzaCgpIHtcbiAgICByZXR1cm4gdGhpcy5lbnF1ZXVlO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIHF1ZXVlJ3MgbWF4aW11bSBjb25jdXJyZW5jeS5cbiAgICogQHBhcmFtIHtudW1iZXJ9IG1heENvbmN1cnJlbmN5IFRoZSBjb25jdXJyZW50IHZhbHVlIHRvIHNldC5cbiAgICogQHJldHVybnMge1Byb21pc2VRdWV1ZX0gVGhlIGN1cnJlbnQgUHJvbWlzZVF1ZXVlIGluc3RhbmNlIGZvciBjaGFpbmluZy5cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgc2V0TWF4Q29uY3VycmVuY3kobWF4Q29uY3VycmVuY3kpIHtcbiAgICB0aGlzLm1heENvbmN1cnJlbmN5ID0gTWF0aC5tYXgoTnVtYmVyKG1heENvbmN1cnJlbmN5KSB8fCAxLCAxKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDYWxsZWQgd2hlbiBhIHRhc2sgaGFzIHN0YXJ0ZWQgcHJvY2Vzc2luZy5cbiAgICogQHJldHVybnMge3VuZGVmaW5lZH1cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgb25NZXRob2RTdGFydGVkKCkge1xuICAgIHRoaXMucnVubmluZysrO1xuICB9XG5cbiAgLyoqXG4gICAqIENhbGxlZCB3aGVuIGEgdGFzayBoYXMgZmluaXNoZWQgcHJvY2Vzc2luZy4gVGhpcyBpcyBjYWxsZWQgcmVnYXJkbGVzc1xuICAgKiBvZiB3aGV0aGVyIG9yIG5vdCB0aGUgdXNlcidzIHF1ZXVlZCBtZXRob2Qgc3VjY2VlZHMgb3IgdGhyb3dzLlxuICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSByZXNvbHZlcnMgVGhlIHJ1bm5pbmcgbWV0aG9kJ3MgcmVzb2x2ZS9yZWplY3QgZnVuY3Rpb25zLlxuICAgKiBAcGFyYW0ge2FueX0gcmVzdWx0IFRoZSByZXN1bHQgeWllbGRlZCBmcm9tIHRoZSBtZXRob2QncyBpbnZvY2F0aW9uLlxuICAgKiBAcmV0dXJucyB7dW5kZWZpbmVkfVxuICAgKiBAbWVtYmVyb2YgUHJvbWlzZVF1ZXVlXG4gICAqL1xuICBvbk1ldGhvZENvbXBsZXRlZChyZXNvbHZlcnMsIHJlc3VsdCkge1xuICAgIHRoaXMucnVubmluZy0tO1xuICAgIGludm9rZUFsbFdpdGhBcmd1bWVudHMocmVzb2x2ZXJzLCBbcmVzdWx0XSk7XG4gICAgdGhpcy50aWNrKCk7XG4gIH1cblxuICAvKipcbiAgICogXCJUaWNrc1wiIHRoZSBxdWV1ZS4gVGhpcyB3aWxsIHN0YXJ0IHByb2Nlc3MgdGhlIG5leHQgaXRlbSBpbiB0aGUgcXVldWVcbiAgICogaWYgdGhlIHF1ZXVlIGlzIGlkbGUgb3IgaGFzbid0IHJlYWNoZWQgdGhlIHF1ZXVlJ3MgYG1heENvbmN1cnJlbmN5YC5cbiAgICogQHJldHVybnMge3VuZGVmaW5lZH1cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgdGljaygpIHtcbiAgICAvLyBOb3RoaW5nIGxlZnQgdG8gcHJvY2VzcyBpbiB0aGUgcXVldWVcbiAgICBpZiAoIXRoaXMucXVldWUubGVuZ3RoKSB7XG4gICAgICBpZiAodHlwZW9mIHRoaXMub25RdWV1ZURyYWluZWQgPT09ICdmdW5jdGlvbicgJiYgIXRoaXMuaXNEcmFpbmVkKSB0aGlzLm9uUXVldWVEcmFpbmVkKCk7XG4gICAgICB0aGlzLmlzRHJhaW5lZCA9IHRydWU7XG4gICAgICB0aGlzLnByaW9yaXR5U29ydE1vZGUgPSBmYWxzZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBUb28gbWFueSBydW5uaW5nIHRhc2tzIG9yIHRoZSBxdWV1ZSBpcyBwYXVzZWQuXG4gICAgaWYgKHRoaXMucnVubmluZyA+PSB0aGlzLm1heENvbmN1cnJlbmN5IHx8IHRoaXMuaXNQYXVzZWQpIHJldHVybjtcbiAgICB0aGlzLm9uTWV0aG9kU3RhcnRlZCgpO1xuXG4gICAgLy8gUHJvY2VzcyB0aGUgbmV4dCB0YXNrIGluIHRoZSBxdWV1ZS5cbiAgICAvLyBUaGlzIHdpbGwgaW5jcmVtZW50IHRoZSBudW1iZXIgb2YgXCJjb25jdXJyZW50bHkgcnVubmluZyBtZXRob2RzXCIsXG4gICAgLy8gcnVuIHRoZSBtZXRob2QsIGFuZCB0aGVuIGRlY3JlbWVudCB0aGUgcnVubmluZyBtZXRob2RzLlxuICAgIGNvbnN0IHtcbiAgICAgIGFyZ3MsXG4gICAgICBtZXRob2QsXG4gICAgICBjb250ZXh0LFxuICAgICAgcmVzb2x2ZXJzLFxuICAgICAgcmVqZWN0b3JzLFxuICAgIH0gPSB0aGlzLnF1ZXVlW3RoaXMubGlmbyA/ICdwb3AnIDogJ3NoaWZ0J10oKTtcblxuICAgIC8vIFdlIG11c3QgY2FsbCB0aGUgZnVuY3Rpb24gaW1lZGlhdGVseSBzaW5jZSB3ZSd2ZSBhbHJlYWR5XG4gICAgLy8gZGVmZXJyZWQgaW52b2NhdGlvbiBvbmNlIChpbiBgZW5xdWV1ZWApLiBPdGhlcndpc2UsIHdlIHdpbGxcbiAgICAvLyBnZXQgYSBzdHJhbmdlIG9yZGVyIG9mIGV4ZWN1dGlvbi5cbiAgICBsZXQgcmV0dXJuZWQ7XG5cbiAgICB0cnkge1xuICAgICAgcmV0dXJuZWQgPSBtZXRob2QuY2FsbChjb250ZXh0LCAuLi5hcmdzKTtcblxuICAgICAgaWYgKHJldHVybmVkICYmIHJldHVybmVkW0lTX1BST01JU0VfUVVFVUVfUFJPTUlTRV0pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICdRdWV1ZSBvdXQgb2Ygb3JkZXIgZXhlY3V0aW9uOiBjYW5ub3QgcmVzb2x2ZSB3aXRoIHNvbWV0aGluZyB0aGF0ICcgK1xuICAgICAgICAgIFwid29uJ3QgYmUgY2FsbGVkIHVudGlsIHRoaXMgZnVuY3Rpb24gY29tcGxldGVzLlwiLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHRoaXMub25NZXRob2RDb21wbGV0ZWQocmVqZWN0b3JzLCBlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBQcm9taXNlLnJlc29sdmUocmV0dXJuZWQpXG4gICAgICAuY2F0Y2goZSA9PiB0aGlzLm9uTWV0aG9kQ29tcGxldGVkKHJlamVjdG9ycywgZSkpXG4gICAgICAudGhlbihyZXN1bHRzID0+IHRoaXMub25NZXRob2RDb21wbGV0ZWQocmVzb2x2ZXJzLCByZXN1bHRzKSk7XG4gIH1cblxuICAvKipcbiAgICogU29ydHMgdGhlIHF1ZXVlIGJhc2VkIG9uIHByaW9yaXRpZXMuXG4gICAqIEByZXR1cm5zIHt1bmRlZmluZWR9XG4gICAqIEBtZW1iZXJvZiBQcm9taXNlUXVldWVcbiAgICovXG4gIHByaW9yaXRpemVRdWV1ZSgpIHtcbiAgICBjb25zdCBkZXByaW9yaXRpemVkID0gW107XG4gICAgY29uc3Qgc29ydGVyID0gdGhpcy5saWZvID8gcHJpb3JpdHlTb3J0TElGTyA6IHByaW9yaXR5U29ydEZJRk87XG4gICAgdGhpcy5xdWV1ZS5zb3J0KHNvcnRlcihkZXByaW9yaXRpemVkKSk7XG5cbiAgICBpZiAodHlwZW9mIHRoaXMub25NZXRob2REZXByaW9yaXRpemVkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBkZXByaW9yaXRpemVkLmZvckVhY2goKGVucXVldWVkKSA9PiB7XG4gICAgICAgIGNvbnN0IHByaW8gPSBOdW1iZXIodGhpcy5vbk1ldGhvZERlcHJpb3JpdGl6ZWQocGljayhlbnF1ZXVlZCwgUElDS19GUk9NX0VOUVVFVUVEKSkpIHx8IDA7XG4gICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1wYXJhbS1yZWFzc2lnblxuICAgICAgICBlbnF1ZXVlZC5wcmlvcml0eSA9IHByaW87XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ2FsbHMgdGhlIGBoYW5kbGVRdWV1ZVJlZHVjdGlvbmAgb24gZWFjaCBpdGVtIGluIHRoZSBxdWV1ZSwgYWxsb3dpbmcgdXNlcnNcbiAgICogdG8gXCJjb21iaW5lXCIgc2ltaWxhciBxdWV1ZWQgbWV0aG9kcyBpbnRvIGEgc2luZ2xlIGNhbGwuXG4gICAqIEByZXR1cm5zIHt1bmRlZmluZWR9XG4gICAqIEBtZW1iZXJvZiBQcm9taXNlUXVldWVcbiAgICovXG4gIHJlZHVjZVF1ZXVlKCkge1xuICAgIGlmICh0eXBlb2YgdGhpcy5oYW5kbGVRdWV1ZVJlZHVjdGlvbiAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuO1xuICAgIHRoaXMucXVldWUgPSB0aGlzLnF1ZXVlLnJlZHVjZShvblF1ZXVlSXRlbVJlZHVjdGlvbih0aGlzLmhhbmRsZVF1ZXVlUmVkdWN0aW9uKSwgW10pO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZHMgYSBtZXRob2QgaW50byB0aGUgUHJvbWlzZVF1ZXVlIGZvciBkZWZlcnJlZCBleGVjdXRpb24uXG4gICAqIEBwYXJhbSB7ZnVuY3Rpb259IG1ldGhvZCBUaGUgZnVuY3Rpb24gdG8gZW5xdWV1ZS5cbiAgICogQHBhcmFtIHtvYmplY3R9IG9wdGlvbnMgTWV0aG9kIHNwZWNpZmljIGVucXVldWVpbmcgb3B0aW9ucy5cbiAgICogQHJldHVybnMge1Byb21pc2V9IFJlc29sdmVzIG9uY2UgdGhlIHBhc3NlZCBpbiBtZXRob2QgaXMgZGVxdWV1ZWQgYW5kIGV4ZWN1dGVkIHRvIGNvbXBsZXRpb24uXG4gICAqIEBtZW1iZXJvZiBQcm9taXNlUXVldWVcbiAgICovXG4gIGVucXVldWUobWV0aG9kLCBvcHRpb25zID0ge30pIHtcbiAgICBjb25zdCBlbnF1ZXVlZE1ldGhvZFByb21pc2UgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCB7IGFyZ3MgPSBbXSwgcHJpb3JpdHkgPSAwLCBjb250ZXh0ID0gdGhpcyB9ID0gb3B0aW9ucztcblxuICAgICAgaWYgKHR5cGVvZiBtZXRob2QgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIHJlamVjdChuZXcgVHlwZUVycm9yKFxuICAgICAgICAgICdQcm9taXNlUXVldWUjZW5xdWV1ZSBleHBlY3RlZCBhIGZ1bmN0aW9uIGZvciBhcmd1bWVudCBcIm1ldGhvZFwiLicsXG4gICAgICAgICkpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIShhcmdzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgIHJldHVybiByZWplY3QobmV3IFR5cGVFcnJvcihcbiAgICAgICAgICAnUHJvbWlzZVF1ZXVlI2VucXVldWUgZXhwZWN0ZWQgYW4gYXJyYXkgZm9yIGFyZ3VtZW50IFwib3B0aW9ucy5hcmdzXCIuJyxcbiAgICAgICAgKSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMucXVldWUucHVzaCh7XG4gICAgICAgIGFyZ3MsXG4gICAgICAgIG1ldGhvZCxcbiAgICAgICAgY29udGV4dCxcbiAgICAgICAgcHJpb3JpdHk6IE51bWJlcihwcmlvcml0eSkgfHwgMCxcbiAgICAgICAgcmVqZWN0b3JzOiBbcmVqZWN0XSxcbiAgICAgICAgcmVzb2x2ZXJzOiBbcmVzb2x2ZV0sXG4gICAgICB9KTtcblxuICAgICAgdGhpcy5pc0RyYWluZWQgPSBmYWxzZTtcblxuICAgICAgLy8gVG9nZ2xlcyB0aGUgcXVldWUgZnJvbSB1bi1zb3J0ZWQgbW9kZSB0byBwcmlvcml0eSBzb3J0IG1vZGUuXG4gICAgICBpZiAoTnVtYmVyKHByaW9yaXR5KSAhPT0gMCkgdGhpcy5wcmlvcml0eVNvcnRNb2RlID0gdHJ1ZTtcblxuICAgICAgLy8gRmlyc3QgcHJpb3JpdGl6ZSB0aGUgcXVldWUgKHNvcnQgaXQgYnkgcHJpb3JpdGllcyksXG4gICAgICAvLyB0aGVuIGFsbG93IHRoZSB1c2VyIHRoZSBvcHBvcnR1bml0eSB0byByZWR1Y2UgaXQuXG4gICAgICBpZiAodGhpcy5wcmlvcml0eVNvcnRNb2RlKSB0aGlzLnByaW9yaXRpemVRdWV1ZSgpO1xuICAgICAgdGhpcy5yZWR1Y2VRdWV1ZSgpO1xuXG4gICAgICBpZiAodHlwZW9mIHRoaXMub25NZXRob2RFbnF1ZXVlZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aGlzLm9uTWV0aG9kRW5xdWV1ZWQobWV0aG9kLCBvcHRpb25zKTtcbiAgICAgIH1cblxuICAgICAgLy8gRGVmZXIgdGhlIGV4ZWN1dGlvbiBvZiB0aGUgdGljayB1bnRpbCB0aGUgbmV4dCBpdGVyYXRpb24gb2YgdGhlIGV2ZW50IGxvb3BcbiAgICAgIC8vIFRoaXMgaXMgaW1wb3J0YW50IHNvIHdlIGFsbG93IGFsbCBzeW5jaHJvbm91cyBcImVucXVldWVzXCIgb2NjdXIgYmVmb3JlIGFueVxuICAgICAgLy8gZW5xdWV1ZWQgbWV0aG9kcyBhcmUgYWN0dWFsbHkgaW52b2tlZC5cbiAgICAgIFByb21pc2UucmVzb2x2ZSgpLnRoZW4oKCkgPT4gdGhpcy50aWNrKCkpO1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9KTtcblxuICAgIGVucXVldWVkTWV0aG9kUHJvbWlzZVtJU19QUk9NSVNFX1FVRVVFX1BST01JU0VdID0gdHJ1ZTtcbiAgICByZXR1cm4gZW5xdWV1ZWRNZXRob2RQcm9taXNlO1xuICB9XG5cbiAgLyoqXG4gICAqIEByZXR1cm5zIHtBcnJheTxmdW5jdGlvbj59IEEgc2hhbGxvdyBjb3B5IG9mIHRoZSBxdWV1ZSdzIGVucXVldWVkIG1ldGhvZHMuXG4gICAqIEBtZW1iZXJvZiBQcm9taXNlUXVldWVcbiAgICovXG4gIGdldEVucXVldWVkTWV0aG9kcygpIHtcbiAgICByZXR1cm4gdGhpcy5xdWV1ZS5tYXAoKHsgbWV0aG9kIH0pID0+IG1ldGhvZCk7XG4gIH1cblxuICAvKipcbiAgICogQ2xlYXJzIGFsbCBlbnF1ZXVlZCBtZXRob2RzIGZyb20gdGhlIHF1ZXVlLiBBbnkgbWV0aG9kIHRoYXQncyBhbHJlYWR5XG4gICAqIGJlZW4gZGVxdWV1ZWQgd2lsbCBzdGlsbCBydW4gdG8gY29tcGxldGlvbi5cbiAgICogQHJldHVybnMge1Byb21pc2VRdWV1ZX0gVGhlIGN1cnJlbnQgUHJvbWlzZVF1ZXVlIGluc3RhbmNlIGZvciBjaGFpbmluZy5cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgY2xlYXIoKSB7XG4gICAgY29uc3QgdmFsdWVzID0gdGhpcy5xdWV1ZS5tYXAoZ2V0RXhwb3J0YWJsZVF1ZXVlT2JqZWN0KTtcbiAgICB0aGlzLnF1ZXVlID0gW107XG4gICAgcmV0dXJuIHZhbHVlcztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIGFuIGVucXVldWVkIG1ldGhvZCBmcm9tIHRoZSBxdWV1ZS4gSWYgdGhlIG1ldGhvZCB0byByZW1vdmVcbiAgICogaGFzIGFscmVhZHkgc3RhcnRlZCBwcm9jZXNzaW5nLCBpdCB3aWxsICpub3QqIGJlIHJlbW92ZWQuXG4gICAqIEBwYXJhbSB7ZnVuY3Rpb259IG1ldGhvZCBUaGUgbWV0aG9kIHRvIHJlbW92ZS5cbiAgICogQHJldHVybnMge2Z1bmN0aW9ufG51bGx9IFRoZSByZW1vdmVkIG1ldGhvZCBpZiBmb3VuZCwgYG51bGxgIG90aGVyd2lzZS5cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgcmVtb3ZlKG1ldGhvZCkge1xuICAgIGlmICh0eXBlb2YgbWV0aG9kICE9PSAnZnVuY3Rpb24nKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBpbmRleCA9IGZpbmRJbmRleCh0aGlzLnF1ZXVlLCAoeyBtZXRob2Q6IGVucXVldWVkIH0pID0+IGVucXVldWVkID09PSBtZXRob2QpO1xuICAgIHJldHVybiBpbmRleCAhPT0gLTEgPyBnZXRFeHBvcnRhYmxlUXVldWVPYmplY3QodGhpcy5xdWV1ZS5zcGxpY2UoaW5kZXgsIDEpWzBdKSA6IG51bGw7XG4gIH1cblxuICAvKipcbiAgICogUGF1c2VzIHRoZSBxdWV1ZS5cbiAgICogQHJldHVybnMge1Byb21pc2VRdWV1ZX0gVGhlIGN1cnJlbnQgUHJvbWlzZVF1ZXVlIGluc3RhbmNlIGZvciBjaGFpbmluZy5cbiAgICogQG1lbWJlcm9mIFByb21pc2VRdWV1ZVxuICAgKi9cbiAgcGF1c2UoKSB7XG4gICAgdGhpcy5pc1BhdXNlZCA9IHRydWU7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogUmVzdW1lcyB0aGUgcXVldWUuXG4gICAqIEByZXR1cm5zIHtQcm9taXNlUXVldWV9IFRoZSBjdXJyZW50IFByb21pc2VRdWV1ZSBpbnN0YW5jZSBmb3IgY2hhaW5pbmcuXG4gICAqIEBtZW1iZXJvZiBQcm9taXNlUXVldWVcbiAgICovXG4gIHJlc3VtZSgpIHtcbiAgICBpZiAodGhpcy5pc1BhdXNlZCkge1xuICAgICAgdGhpcy5pc1BhdXNlZCA9IGZhbHNlO1xuICAgICAgdGhpcy50aWNrKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbn07XG4iXX0=
