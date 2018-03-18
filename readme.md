# @jasonpollman/promise-queue
> The flexible queue library.

Creates queues that run `maxConcurrency` methods at a time and waits for each method to resolve before invoking the next.

- Support for queue pausing, prioritization, and combining like calls (queue reduction).
- Magical "queueification" of objects and methods.
- Has both FIFO and LIFO modes.
- Works in both browsers and node.js.

## Requirements
Native `Promise` support or a polyfill.

## Uses
- Preventing data hazards (read after write, write after read, etc.)
- Preventing libraries that use file locks from running concurrent commands (git, for example).
- "Job" scheduling and prioritization.
- Any other practical queue use case.

## Install
Via NPM:
```bash
npm install @jasonpollman/promise-queue --save
```

In the browser:
```html
<script src="dist/PromiseQueue.js"></script>
```

**The exported library is UMD**    
So it's consumable by both AMD and CommonJS frameworks.    
*Examples shown are using the CommonJS format*

## Usage
```js
import PromiseQueue from '@jasonpollman/promise-queue';

const queue = new PromiseQueue();

// Basic Enqueueing
// The given method will run when it's next up in the queue.
// Every call to `PromiseQueue#enqueue` returns a Promise!
queue.enqueue(() => 'hello world!').then(console.log);

// Queueing/Async Behavior:
// Although both methods are enqueued immediately and return promises,
// `b` will not run until `a` has resolved.
queue.enqueue(() => Promise.delay(1000).then('a')).then(console.log);
queue.enqueue(() => Promise.delay(1000).then('b')).then(console.log);

// Prints 'a', 1 second passes, then prints 'b'.

// Staggered Enqueueing:
// Enqueueing within an enqueued method, will push
// the new method to the *back* of the queue.
function c() {
  return 'c';
}

function b() {
  return 'b';
}

function a() {
  queue.enqueue(c).then(console.log);
  return 'a';
}

queue.enqueue(a).then(console.log);
queue.enqueue(b).then(console.log);

// Prints 'a', 'b', then 'c'.
// Since 'a' and 'b' are immediately enqueued, they run first and one at a time.
// Method 'c' is enqueued inside of a, but 'b' was already enqueued.
```

## Queueification
**It's like promisification for a queue!**

You can "queueify" a method by using `PromiseQueue.queueify([method], { /* options */ })`.    
This will return a new function that enqueues calls to the original.

###  Queueifying a single method: `PromiseQueue.queueify`
```js
async function example() { ... }

// Creates a *new* function using a *new* PromiseQueue.
// All calls to this method will be queued.
const queuedExample = PromiseQueue.queueify(example);

// You can specify the PromiseQueue instance to use:
const myQueue = new PromiseQueue();
const queuedWithMyQueue = PromiseQueue.queueify(example, { queue: myQueue });

// All options shown with defaults...
PromiseQueue.queueify(method, {
  queue: new PromiseQueue(),  // The queue this function will operate using.
  context: queue,             // The value of `this` inside the queueified method.
  priority: 0,                // This method's queue priority value.
});
```

### Queueifying an entire object: `PromiseQueue.queueifyAll`
**This works similar to bluebird's `Promise.promisifyAll`.**    
Given an object, this will queueify all of the object's **direct and inherited** methods.
The queueified methods will be assigned to the object with their names prefixed with `queued`.

Unless a specific PromiseQueue instance is specified using `options.queue`, this will create a single,
new PromiseQueue instance that all of the queueified methods will operate using.

```js
const object = {
  foo() { ... },
  bar() { ... },
}

PromiseQueue.queueifyAll(object);

// Object looks like this now:
object = {
  foo() { ... },
  bar() { ... },
  queuedFoo() { ... },
  queuedBar() { ... },
  queue, // A reference to the PromiseQueue instance this object is using
}

// All options shown with defaults...
PromiseQueue.queueifyAll(object, {
  prefix = 'queued',                // The prefix for queueified method names.
  suffix = '',                      // The suffix for queueified method names.
  queue = new PromiseQueue(),       // The queue this object's queueified functions will operate using.
  assignQueueAsProperty = 'queue',  // The property name used to attach the queue reference on this
                                    // object using. Set to a falsy value to prevent attaching the
                                    // queue to the object.
  priorities = {},                  // An mapping of the object's original method names to the
                                    // priority that the queueified version should use.
});
```

## PromiseQueue API

### PromiseQueue.queueify({function} method, {object} options) => {function}
See [Queueification](#queueification) above.

### PromiseQueue.queueifyAll({object} target, {object} options) => {object}
See [Queueification](#queueification) above.

### PromiseQueue#constructor({object} options) => {PromiseQueue}
Creates a new PromiseQueue instance.

**Options:**

| Property              | Type      | Default     | Description |
| --------------------- | --------- | ----------- | ----------- |
| lifo                  | boolean   | `false`     | If `true`, the queue will operate in LIFO mode (rather than the default FIFO mode). This makes the queue operate like a stack. |
| maxConcurrency        | number    | `1`         | The maximum number of of enqueued items to process simultaneously. |
| handleQueueReduction  | function= | `undefined` | An optional function that allows you to "combine" or drop queue items (see [Queue Reduction](#queue-reduction)) |
| onQueueDrained        | function= | `undefined` | An optional function that's called when the queue is depleted. Depletion means when all items in the queue have been processed and there's nothing left in the queue. This will be called every time the queue is drained (items are added and the queue depletes). |
| onMethodEnqueued      | function= | `undefined` | If supplied, this function is called **every** time a method is enqueued with the method and its enqueue options |
| onMethodDeprioritized | function= | `undefined` | If supplied, this function is called each time a method is "pushed" back in the queue due to prioritization. **Whatever value you return from this method become the new method's queue priority.** This provides the opportunity to prevent the method from being pushed back at each enqueue and never being called. |

### PromiseQueue#size => {number}
Returns the number of enqueued items in the queue.

```js
const enqueuedFunctionCount = queue.size;
```

### PromiseQueue#setMaxConcurrency({number} value) => {PromiseQueue}
Sets the queue's `maxConcurrency` value and returns the current PromiseQueue instance for chaining.

```js
queue.setMaxConcurrency(5);
```

### PromiseQueue#enqueue({function} item, {object=} options) => {Promise}
Adds an item to the queue for deferred processing and returns a Promise that resolves
once the function has been dequeued and executed to completion.

**Options:**

| Property             | Type     | Default     | Description |
| -------------------- | -------- | ----------- | ----------- |
| args                 | Array    | []          | An array of arguments to invoke the enqueued function with. **This must be an array.** |
| priority             | number   | `0`         | This methods queue priority. Higher values moves enqueued items to the front of the queue. |
| context              | any      | The current PromiseQueue instance | The `this` value used when the enqueued function is called. |

```js
function example() {
 ...
}

const promise = queue.enqueue(example, { /* options */ });
```

### PromiseQueue#push({function} item, {object=} options) => {Promise}
An alias for `enqueue`. If you're running in `lifo` mode, this verb may be more fitting.

### PromiseQueue#getEnqueuedMethods() => {Array<functon>}
Returns a shallow copy of all of the queues enqueued methods.

```js
const arrayOfEnqueuedMethods = queue.getEnqueuedMethods();
```

### PromiseQueue#clear() => {PromiseQueue}
Clears all enqueued items from the queue and returns an array of objects containing the following
information for each dequeued function:

- method
  The original method that was passed when `queue.enqueue` was called.
- resolve
  Resolves the promise returned when `queue.enqueue` was called with the respective method.
- reject
  Rejects the promise returned when `queue.enqueue` was called with the respective method.
- args
  The arguments array that was provided to the `queue.enqueue`'s options argument.
- priority
  The method's queue priority.
- context
  The method's context value.

```js
const promiseA = queue.enqueue(example, { /* options */ });
const promiseB = queue.enqueue(example, { /* options */ });
const dequeued = queue.clear();

// Note, `promiseA` and `promiseB` will not resolve since they've been removed from the queue and will not run.
// Since you've removed it, it's up to you to resolve/reject or ignore these promises using the return
// value from `queue.clear`
```

### PromiseQueue#remove({function} item) => {function|null}
Removes the first instance of the given function from the queue and returns an object containing
the resolve/reject methods correcponding to the promise returned by the original `queue.enqueue` call.
If the function wasn't found it the queue `null` is returned.

```js
function example() {
 ...
}

const promise = queue.enqueue(example, { /* options */ });
const { resolve, reject } = queue.remove(example);

// Note, `promise` will not resolve since it's been removed from the queue and will not run.
// Since you've removed it, it's up to you to resolve/reject or ignore the promise
// returned from the call to `queue.enqueue`.
```

### PromiseQueue#pause() => {PromiseQueue}
Pauses the queue and returns the current PromiseQueue instance for chaining.
No further items will be processed until `PromiseQueue#resume` is called.
Note, in node.js this will not prevent the process from exiting. If you pause the queue with items 
remaining in it, the program will still exit.

```js
queue.pause();
```

### PromiseQueue#resume() => {PromiseQueue}
Resumes the queue (if it's paused) and returns the current PromiseQueue instance for chaining.

```js
queue.resume();
```

## Queue Priority
Queue items are prioritized as their pushed in to the queue based on their `priority` value.
Higher values will move the enqueued item to the *front* of the queue.

Priorities default to `0`, so if you don't need a priority queue, simply don't pass in any
priority option values.

When all priorities are `0`, the queue operates in "non-priority sorting mode", and the queue
won't be sorted each time `enqueue` is called. This is much more efficient, so if you don't need
priorities, don't use them.

### Handling Priority "Deadlocks"
It's possible that a low priority method that's been enqueued can be never called if a queue
is frequently enqueueing high priority methods (on some interval, for example).

For this reason, if you are utilizing priorities, you **should** pass in a `onMethodDeprioritized`
method to handle this case.

This method lets you adjust the priority of an enqueued item each time it's moved back in the queue.

You can increment a low method's priority using this hook so that the enqueued method will eventually
bubble up to the top of the queue and be executed with some knowledge of the maximum times the
queue ticks before the method is guaranteed to run:

```js
function onMethodDeprioritized(enqueued) {
  // Increase the priority of the method each time it's "deprioritized".
  const priority = enqueued.priority;
  return priority + 1;
};

const queue = new PromiseQueue({
  onMethodDeprioritized,
})
```

## Queue Reduction
### @todo