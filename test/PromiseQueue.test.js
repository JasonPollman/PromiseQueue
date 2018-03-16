/* eslint-disable require-jsdoc, class-methods-use-this */

import {
  expect,
  assert,
} from 'chai';

import PromiseQueue from '../src/PromiseQueue';

const noop = () => {};
const delay = duration => new Promise(resolve => setTimeout(resolve, duration));

describe('PromiseQueue', () => {
  it('Should export a class by default', () => {
    expect(PromiseQueue).to.be.a('function');
  });

  describe('PromiseQueue.queueify', () => {
    it('Should "queueify" a method', () => {
      function method(input) {
        expect(this).to.be.an.instanceof(PromiseQueue);
        return input;
      }

      const queueified = PromiseQueue.queueify(method);
      expect(queueified).to.be.a('function');

      const result = queueified('foo');
      expect(result).to.be.an.instanceof(Promise);
      return result.then(returned => expect(returned).to.equal('foo'));
    });

    it('Should "queueify" a method with (`options.context` specified)', () => {
      function method(input) {
        expect(this).to.equal('context');
        return input;
      }

      const queueified = PromiseQueue.queueify(method, { context: 'context' });
      expect(queueified).to.be.a('function');

      const result = queueified('foo');
      expect(result).to.be.an.instanceof(Promise);
      return result.then(returned => expect(returned).to.equal('foo'));
    });

    it('Should "queueify" a method (`options.priority` specified)', () => {
      function method(input) {
        expect(this).to.be.an.instanceof(PromiseQueue);
        return input;
      }

      const queueified = PromiseQueue.queueify(method, { priority: 10 });
      expect(queueified).to.be.a('function');

      const result = queueified('foo');
      expect(result).to.be.an.instanceof(Promise);
      return result.then(returned => expect(returned).to.equal('foo'));
    });

    it('Should throw if the value to queueify isn\'t a function', () => {
      assert.throws(
        () => PromiseQueue.queueify('foo'),
        'You must pass a function for parameter "method" to queueify.',
      );
    });

    it('Should throw if `options.queue` isn\'t an instance of PromiseQueue', () => {
      assert.throws(
        () => PromiseQueue.queueify(noop, { queue: null }),
        'PromiseQueue.queueify expected an instance of PromiseQueue for parameter "queue".',
      );
    });
  });

  describe('PromiseQueue.queueifyAll', () => {
    it('Should throw if the object isn\'t extensible', () => {
      assert.throws(
        () => PromiseQueue.queueifyAll(Object.freeze({})),
        'Cannot queueify a non-object or non-extensible object.',
      );
    });

    it('Should throw if the thing to queueify isn\'t an object', () => {
      assert.throws(
        () => PromiseQueue.queueifyAll(() => {}),
        'Cannot queueify a non-object or non-extensible object.',
      );
    });

    it('Should queueify all of an object\'s own functions (plain object)', () => {
      const foo = () => 'foo';
      const bar = () => 'bar';

      const object = { prop: 'prop', foo, bar };

      expect(PromiseQueue.queueifyAll(object)).to.equal(object);

      expect(object.foo).to.equal(foo);
      expect(object.bar).to.equal(bar);
      expect(object.prop).to.equal('prop');
      expect(object.queue).to.be.an.instanceof(PromiseQueue);

      expect(object.queuedFoo).to.be.a('function');
      expect(object.queuedBar).to.be.a('function');
      expect(object.queueProp).to.equal(undefined);

      const promises = [object.queuedFoo(), object.queuedBar()];
      expect(object.queue.size).to.equal(2);

      return Promise.all(promises).then((result) => {
        expect(object.queue.size).to.equal(0);
        expect(result).to.eql(['foo', 'bar']);
      });
    });

    it('Should queueify all of an object\'s own functions (class instance)', () => {
      let object;

      class Foobar {
        static baz() {
          return 'baz';
        }

        constructor() {
          this.prop = 'prop';
        }

        foo() {
          expect(this).to.equal(object);
          return 'foo';
        }

        bar() {
          expect(this).to.equal(object);
          return 'bar';
        }
      }

      object = new Foobar();
      expect(PromiseQueue.queueifyAll(object)).to.equal(object);

      expect(object.foo).to.equal(Foobar.prototype.foo);
      expect(object.bar).to.equal(Foobar.prototype.bar);
      expect(object.prop).to.equal('prop');
      expect(object.queue).to.be.an.instanceof(PromiseQueue);

      expect(object.queuedFoo).to.be.a('function');
      expect(object.queuedBar).to.be.a('function');
      expect(object.queueProp).to.equal(undefined);
      expect(object.queuedBaz).to.be.a('function');

      expect(Object.hasOwnProperty.call(object, 'queuedFoo')).to.equal(true);
      expect(Object.hasOwnProperty.call(object, 'queuedBar')).to.equal(true);
      expect(Object.hasOwnProperty.call(object, 'queuedBaz')).to.equal(true);

      const promises = [object.queuedFoo(), object.queuedBar(), object.queuedBaz()];
      expect(object.queue.size).to.equal(3);

      return Promise.all(promises).then((result) => {
        expect(object.queue.size).to.equal(0);
        expect(result).to.eql(['foo', 'bar', 'baz']);
      });
    });

    it('Should queueify all of an object\'s own functions (class instance with inheritance)', () => {
      let object;

      class Foobar {
        static quxx() {
          expect(this).to.equal(object);
          return 'quxx';
        }

        static baz() {
          throw new Error('Expected this method to not be called');
        }

        constructor() {
          this.prop = 'prop-foobar';
        }

        foo() {
          throw new Error('Expected this method to not be called');
        }

        bar() {
          throw new Error('Expected this method to not be called');
        }

        inherited() {
          expect(this).to.equal(object);
          return 'inherited';
        }
      }

      class Bazbar extends Foobar {
        static baz() {
          expect(this).to.equal(object);
          return 'baz';
        }

        constructor() {
          super();
          this.prop = 'prop-bazbar';
        }

        foo() {
          expect(this).to.equal(object);
          return 'foo';
        }

        bar() {
          expect(this).to.equal(object);
          return 'bar';
        }
      }

      object = new Bazbar();
      expect(PromiseQueue.queueifyAll(object)).to.equal(object);

      expect(object.foo).to.equal(Bazbar.prototype.foo);
      expect(object.bar).to.equal(Bazbar.prototype.bar);
      expect(object.prop).to.equal('prop-bazbar');
      expect(object.queue).to.be.an.instanceof(PromiseQueue);

      expect(object.queuedFoo).to.be.a('function');
      expect(object.queuedBar).to.be.a('function');
      expect(object.queueProp).to.equal(undefined);
      expect(object.queuedBaz).to.be.a('function');

      expect(Object.hasOwnProperty.call(object, 'queuedFoo')).to.equal(true);
      expect(Object.hasOwnProperty.call(object, 'queuedBar')).to.equal(true);
      expect(Object.hasOwnProperty.call(object, 'queuedQuxx')).to.equal(true);
      expect(Object.hasOwnProperty.call(object, 'queuedInherited')).to.equal(true);

      const promises = [
        object.queuedFoo(),
        object.queuedBar(),
        object.queuedQuxx(),
        object.queuedInherited(),
      ];

      expect(object.queue.size).to.equal(4);

      return Promise.all(promises).then((result) => {
        expect(object.queue.size).to.equal(0);
        expect(result).to.eql(['foo', 'bar', 'quxx', 'inherited']);
      });
    });

    it('Should not assign the queue to the object if `options.assignQueueAsProperty` is false', () => {
      const foo = () => 'foo';
      const bar = () => 'bar';

      const object = { prop: 'prop', foo, bar };

      expect(PromiseQueue.queueifyAll(object, { assignQueueAsProperty: false })).to.equal(object);

      expect(object.foo).to.equal(foo);
      expect(object.bar).to.equal(bar);
      expect(object.prop).to.equal('prop');
      expect(object.queue).to.equal(undefined);

      expect(object.queuedFoo).to.be.a('function');
      expect(object.queuedBar).to.be.a('function');
      expect(object.queueProp).to.equal(undefined);
    });
  });

  describe('Instances', () => {
    let instance;

    beforeEach(() => {
      instance = new PromiseQueue();
    });

    describe('PromiseQueue#constructor', () => {
      it('Should set the default properties on the instance', () => {
        expect(instance.queue).to.eql([]);
        expect(instance.running).to.equal(0);
        expect(instance.lifo).to.equal(false);
        expect(instance.isPaused).to.equal(false);
        expect(instance.maxConcurrency).to.equal(1);
        expect(instance.handleQueueReduction).to.equal(undefined);
        expect(instance.onQueueDrained).to.equal(undefined);
      });
    });

    describe('PromiseQueue#getEnqueuedMethods', () => {
      it('Should return a shallow copy of all the enqueued methods', () => {
        instance.pause();
        expect(instance.getEnqueuedMethods()).to.eql([]);
        instance.enqueue(noop);

        return Promise.resolve()
          .then(() => expect(instance.getEnqueuedMethods()).to.eql([noop]))
          .then(() => instance.resume())
          .then(() => expect(instance.getEnqueuedMethods()).to.eql([]));
      });
    });

    describe('PromiseQueue#setMaxConcurrency', () => {
      it('Should set the queue\'s maximum concurrency value', () => {
        expect(instance.maxConcurrency).to.equal(1);
        expect(instance.setMaxConcurrency(5)).to.equal(instance);
        expect(instance.maxConcurrency).to.equal(5);
      });

      it('Should clamp the lower bound to 1', () => {
        expect(instance.maxConcurrency).to.equal(1);
        expect(instance.setMaxConcurrency(-1)).to.equal(instance);
        expect(instance.maxConcurrency).to.equal(1);
        expect(instance.setMaxConcurrency(-100)).to.equal(instance);
        expect(instance.maxConcurrency).to.equal(1);
        expect(instance.setMaxConcurrency(0)).to.equal(instance);
        expect(instance.maxConcurrency).to.equal(1);
      });
    });

    describe('PromiseQueue#clear', () => {
      it('Should clear all enqueued items from the queue and return exportable dequeued objects', () => {
        expect(instance.queue).to.eql([]);
        const a = () => {};
        const b = () => {};
        const c = () => {};

        instance.enqueue(a);
        instance.enqueue(b);
        instance.enqueue(c);

        expect(instance.size).to.eql(3);
        const dequeued = instance.clear();

        dequeued.forEach((item) => {
          const object = item;
          expect(object.resolve).to.be.a('function');
          expect(object.reject).to.be.a('function');
          delete object.resolve;
          delete object.reject;
        });

        expect(dequeued).to.eql([
          {
            method: a,
            context: instance,
            args: [],
            priority: 0,
          },
          {
            method: b,
            context: instance,
            args: [],
            priority: 0,
          },
          {
            method: c,
            context: instance,
            args: [],
            priority: 0,
          },
        ]);
        expect(instance.queue).to.eql([]);
      });
    });

    describe('PromiseQueue#remove', () => {
      it('Should return `null` if the value given to remove isn\'t a function', () => {
        expect(instance.remove()).to.equal(null);
        expect(instance.remove({})).to.equal(null);

        instance.enqueue(noop);
        instance.enqueue(noop);
        instance.enqueue(noop);

        expect(instance.remove()).to.equal(null);
        expect(instance.remove({})).to.equal(null);
      });

      it('Should return `null` if the function to remove isn\'t in the queue', () => {
        expect(instance.remove(noop)).to.equal(null);
        expect(instance.remove(() => {})).to.equal(null);

        instance.enqueue(noop);
        instance.enqueue(noop);
        instance.enqueue(noop);

        expect(instance.remove()).to.equal(null);
        expect(instance.remove(() => {})).to.equal(null);
      });

      it('Should remove functions from the queue (unpaused)', () => {
        expect(instance.getEnqueuedMethods()).to.eql([]);

        instance.enqueue(noop);
        instance.enqueue(noop);
        instance.enqueue(noop);

        expect(instance.getEnqueuedMethods()).to.eql([noop, noop, noop]);
        instance.remove(noop);
        expect(instance.getEnqueuedMethods()).to.eql([noop, noop]);
        instance.remove(noop);
        expect(instance.getEnqueuedMethods()).to.eql([noop]);
        instance.remove(noop);
        expect(instance.getEnqueuedMethods()).to.eql([]);
      });

      it('Should remove functions from the queue (paused)', () => {
        instance.pause();
        expect(instance.getEnqueuedMethods()).to.eql([]);

        instance.enqueue(noop);
        instance.enqueue(noop);
        instance.enqueue(noop);

        expect(instance.getEnqueuedMethods()).to.eql([noop, noop, noop]);
        instance.remove(noop);
        expect(instance.getEnqueuedMethods()).to.eql([noop, noop]);
        instance.remove(noop);
        expect(instance.getEnqueuedMethods()).to.eql([noop]);
        instance.remove(noop);
        expect(instance.getEnqueuedMethods()).to.eql([]);
      });

      it('Should remove functions from the queue (intermittent between calls, resolving)', () => {
        expect(instance.getEnqueuedMethods()).to.eql([]);

        const first = instance.enqueue(noop, { args: [0] });
        const second = instance.enqueue(noop, { args: [1] });
        const third = instance.enqueue(noop, { args: [2] });

        expect(instance.getEnqueuedMethods()).to.eql([noop, noop, noop]);

        return first.then(() => {
          expect(instance.getEnqueuedMethods()).to.eql([noop]);
          const removed = instance.remove(noop);
          const { resolve } = removed;

          expect(removed.resolve).to.be.a('function');
          expect(removed.reject).to.be.a('function');

          delete removed.resolve;
          delete removed.reject;

          expect(removed).to.eql({
            args: [2],
            method: noop,
            context: instance,
            priority: 0,
          });

          resolve('was removed');

          expect(instance.getEnqueuedMethods()).to.eql([]);
          return Promise.all([second, third]).then(([, removedResult]) => {
            expect(removedResult).to.equal('was removed');
          });
        });
      });

      it('Should remove functions from the queue (intermittent between calls, rejecting)', () => {
        expect(instance.getEnqueuedMethods()).to.eql([]);

        const first = instance.enqueue(noop, { args: [0] });
        const second = instance.enqueue(noop, { args: [1] });
        const third = instance.enqueue(noop, { args: [2] });

        expect(instance.getEnqueuedMethods()).to.eql([noop, noop, noop]);

        return first.then(() => {
          expect(instance.getEnqueuedMethods()).to.eql([noop]);
          const removed = instance.remove(noop);
          const { reject } = removed;

          expect(removed.resolve).to.be.a('function');
          expect(removed.reject).to.be.a('function');

          delete removed.resolve;
          delete removed.reject;

          expect(removed).to.eql({
            args: [2],
            method: noop,
            context: instance,
            priority: 0,
          });

          reject(new Error('was removed'));
          expect(instance.getEnqueuedMethods()).to.eql([]);

          return Promise
            .all([second, third])
            .then(() => { throw new Error('Expected test to throw...'); })
            .catch(e => expect(e.message).to.equal('was removed'));
        });
      });
    });

    describe('PromiseQueue#pause', () => {
      it('Should pause the queue', (done) => {
        expect(instance.isPaused).to.equal(false);
        instance.pause();

        expect(instance.isPaused).to.equal(true);
        instance.enqueue(() => done(new Error('Expected this function to *not* be invoked')));
        instance.enqueue(() => done(new Error('Expected this function to *not* be invoked')));
        instance.enqueue(() => done(new Error('Expected this function to *not* be invoked')));
        expect(instance.size).to.equal(3);

        setTimeout(() => {
          try {
            expect(instance.size).to.equal(3);
            expect(instance.isPaused).to.equal(true);
            done();
          } catch (e) {
            done(e);
          }
        }, 250);
      });
    });

    describe('PromiseQueue#resume', () => {
      it('Should return the instance', () => {
        expect(instance.resume()).to.equal(instance);
      });

      it('Should resume a paused queue (1)', (done) => {
        expect(instance.isPaused).to.equal(false);

        instance.pause();
        expect(instance.isPaused).to.equal(true);

        const promises = [];
        let calls = 0;

        promises.push(instance.enqueue(() => { calls++; }));
        promises.push(instance.enqueue(() => { calls++; }));
        promises.push(instance.enqueue(() => { calls++; }));
        expect(instance.size).to.equal(3);

        setTimeout(() => {
          try {
            expect(instance.size).to.equal(3);
            expect(instance.isPaused).to.equal(true);

            instance.resume();
            expect(instance.isPaused).to.equal(false);

            Promise.all(promises).then(() => {
              try {
                expect(calls).to.equal(3);
                done();
              } catch (e) {
                done(e);
              }
            });
          } catch (e) {
            done(e);
          }
        }, 250);
      });

      it('Should resume a paused queue (2)', () => {
        expect(instance.isPaused).to.equal(false);

        const promises = [];
        promises.push(instance.enqueue(() => delay(50)));
        promises.push(instance.enqueue(() => delay(50)));
        promises.push(instance.enqueue(() => delay(50)));

        return delay(50)
          .then(() => {
            instance.pause();
            expect(instance.isPaused).to.equal(true);
            expect(instance.size).to.equal(2);
            return delay(50);
          })
          .then(() => {
            expect(instance.size).to.equal(2);
            instance.resume();
            return Promise.all(promises);
          });
      });
    });

    describe('PromiseQueue#size', () => {
      it('Should be initialized with a size of 0', () => {
        expect(instance.size).to.equal(0);
      });

      it('Should increment the size when items are enqueued', () => {
        expect(instance.size).to.equal(0);
        const enqueued = [];

        enqueued.push(instance.enqueue(noop));
        expect(instance.size).to.equal(1);

        enqueued.push(instance.enqueue(noop));
        expect(instance.size).to.equal(2);

        return Promise.all(enqueued).then(() => {
          expect(instance.size).to.equal(0);
        });
      });
    });

    describe('PromiseQueue#enqueue', () => {
      it('Should reject if the given method isn\'t a function', () => instance.enqueue({})
        .then(() => { throw new Error('Expected test to throw...'); })
        .catch(e => expect(e.message).to.equal('PromiseQueue#enqueue expected a function for argument "method".')),
      );

      it('Should reject if the options.args isn\'t an array', () => instance.enqueue(noop, { args: '' })
        .then(() => { throw new Error('Expected test to throw...'); })
        .catch(e => expect(e.message).to.equal('PromiseQueue#enqueue expected an array for argument "options.args".')),
      );

      it('Should throw if an enqueued item rejects', () => {
        const promiseA = instance.enqueue(noop);
        const promiseB = instance.enqueue(() => Promise.reject(new Error('oops...')));
        const promiseC = instance.enqueue(noop);

        return Promise.all([
          promiseA
            .then(results => expect(results).to.equal(undefined)),
          promiseB
            .then(() => { throw new Error('Expected this method to throw'); })
            .catch(e => expect(e.message).to.equal('oops...')),
          promiseC
            .then(results => expect(results).to.equal(undefined)),
        ]);
      });

      it('Should throw if an enqueued item throws', () => {
        const promiseA = instance.enqueue(noop);
        const promiseB = instance.enqueue(() => { throw new Error('oops...'); });
        const promiseC = instance.enqueue(noop);

        return Promise.all([
          promiseA
            .then(results => expect(results).to.equal(undefined)),
          promiseB
            .then(() => { throw new Error('Expected this method to throw'); })
            .catch(e => expect(e.message).to.equal('oops...')),
          promiseC
            .then(results => expect(results).to.equal(undefined)),
        ]);
      });

      it('Should run items in the correct order (fifo mode)', () => {
        const results = [];

        return Promise.all([
          instance.enqueue(() => results.push('a')),
          instance.enqueue(() => results.push('b')),
          instance.enqueue(() => results.push('c')),
        ]).then(() => {
          expect(results).to.eql(['a', 'b', 'c']);
        });
      });

      it('Should run items in the correct order (fifo mode, using push)', () => {
        const results = [];

        return Promise.all([
          instance.push(() => results.push('a')),
          instance.push(() => results.push('b')),
          instance.push(() => results.push('c')),
        ]).then(() => {
          expect(results).to.eql(['a', 'b', 'c']);
        });
      });

      it('Should run items in the correct order (fifo mode, nested)', () => {
        const results = [];
        const staggered = [];

        return Promise.all([
          instance.enqueue(() => {
            results.push('a');
            staggered.push(instance.enqueue(() => results.push('a2')));
          }),
          instance.enqueue(() => {
            results.push('b');
            staggered.push(instance.enqueue(() => results.push('b2')));
          }),
          instance.enqueue(() => {
            results.push('c');
            staggered.push(instance.enqueue(() => results.push('c2')));
          }),
        ]).then(() => Promise.all(staggered)).then(() => {
          expect(results).to.eql(['a', 'b', 'c', 'a2', 'b2', 'c2']);
        });
      });

      it('Should run items in the correct order (fifo mode, `onQueueDrained` fired)', (done) => {
        let count = 0;
        const results = [];

        const method = () => {
          results.push(count++);
          return Promise.resolve();
        };

        /* eslint-disable no-loop-func */
        for (let i = 0; i < 100; i++) {
          instance.enqueue(() => {
            method(count);
            instance.enqueue(() => {
              method(count);
              instance.enqueue(method, { args: [count] });
            });
          });
        }
        /* eslint-enable no-loop-func */

        instance.onQueueDrained = () => {
          try {
            expect(count).to.equal(300);
            for (let i = 0; i < 300; i++) expect(results[i]).to.equal(i);
            done();
          } catch (e) {
            done(e);
          }
        };
      });

      it('Should run items in the correct order (lifo mode, `onQueueDrained` fired)', (done) => {
        instance.lifo = true;

        let count = 0;
        const results = [];

        const method = () => {
          results.push(count++);
          return Promise.resolve();
        };

        /* eslint-disable no-loop-func */
        for (let i = 0; i < 100; i++) {
          instance.enqueue(() => {
            method(count);
            instance.enqueue(() => {
              method(count);
              instance.enqueue(method, { args: [count] });
            });
          });
        }
        /* eslint-enable no-loop-func */

        instance.onQueueDrained = () => {
          try {
            expect(count).to.equal(300);
            for (let i = 0; i < 300; i++) expect(results[i]).to.equal(i);
            done();
          } catch (e) {
            done(e);
          }
        };
      });

      it('Should run items in the correct order (lifo mode)', () => {
        const queue = new PromiseQueue({ lifo: true });
        const results = [];

        return Promise.all([
          queue.enqueue(() => results.push('a')),
          queue.enqueue(() => results.push('b')),
          queue.enqueue(() => results.push('c')),
        ]).then(() => {
          expect(results).to.eql(['c', 'b', 'a']);
        });
      });

      it('Should run items in the correct order (lifo mode, using push)', () => {
        const queue = new PromiseQueue({ lifo: true });
        const results = [];

        return Promise.all([
          queue.push(() => results.push('a')),
          queue.push(() => results.push('b')),
          queue.push(() => results.push('c')),
        ]).then(() => {
          expect(results).to.eql(['c', 'b', 'a']);
        });
      });

      it('Should throw if trying to wait on a future enqueued method',
        () => instance.enqueue(() => instance.enqueue(noop))
          .then(() => { throw new Error('Expected test to throw'); })
          .catch(e => expect(e.message).to.equal(
            "Queue out of order execution: cannot resolve with something that won't be called until this function completes.",
          )),
      );

      it('Should run items in the correct order (lifo mode, nested)', () => {
        const queue = new PromiseQueue({ lifo: true });

        const results = [];
        const staggered = [];

        return Promise.all([
          queue.enqueue(() => {
            results.push('a');
            staggered.push(queue.enqueue(() => results.push('a2')));
          }),
          queue.enqueue(() => {
            results.push('b');
            staggered.push(queue.enqueue(() => results.push('b2')));
          }),
          queue.enqueue(() => {
            results.push('c');
            staggered.push(queue.enqueue(() => results.push('c2')));
          }),
        ]).then(() => Promise.all(staggered)).then(() => {
          expect(results).to.eql(['c', 'c2', 'b', 'b2', 'a', 'a2']);
        });
      });

      it('Should run up to `maxConcurrency` functions at a time (1)', () => {
        instance.setMaxConcurrency(2);
        const results = [];

        instance.enqueue(() => delay(50).then(() => results.push('a')));
        instance.enqueue(() => delay(50).then(() => results.push('b')));
        instance.enqueue(() => delay(50).then(() => results.push('c')));

        return delay(75)
          .then(() => expect(results).to.eql(['a', 'b']))
          .then(() => delay(51))
          .then(() => expect(results).to.eql(['a', 'b', 'c']));
      });

      it('Should run up to `maxConcurrency` functions at a time (2)', () => {
        instance.setMaxConcurrency(Number.MAX_SAFE_INTEGER);
        const results = [];

        instance.enqueue(() => delay(50).then(() => results.push('a')));
        instance.enqueue(() => delay(50).then(() => results.push('b')));
        instance.enqueue(() => delay(50).then(() => results.push('c')));

        return delay(75).then(() => expect(results).to.eql(['a', 'b', 'c']));
      });

      it('Should run up to `maxConcurrency` functions at a time (3)', () => {
        instance.setMaxConcurrency(-1);
        const results = [];

        instance.enqueue(() => delay(50).then(() => results.push('a')));
        instance.enqueue(() => delay(50).then(() => results.push('b')));
        instance.enqueue(() => delay(50).then(() => results.push('c')));

        return delay(75)
          .then(() => expect(results).to.eql(['a']))
          .then(() => delay(51))
          .then(() => expect(results).to.eql(['a', 'b']))
          .then(() => delay(51))
          .then(() => expect(results).to.eql(['a', 'b', 'c']));
      });

      it('Should bind the proper context (default context)', () => instance.enqueue(
        function enqueued() {
          expect(this).to.equal(instance);
          return true;
        },
      ).then(results => expect(results).to.eql(true)));

      it('Should bind the proper context (with `options.context`)', () => instance.enqueue(
        function enqueued() {
          expect(this).to.equal('foobar');
          return true;
        },
        {
          context: 'foobar',
        },
      ).then(results => expect(results).to.eql(true)));
    });

    describe('PromiseQueue#reduceQueue', () => {
      it('Should allow the user to combine calls', () => {
        instance.handleQueueReduction = (prev, current, combine) => {
          if (prev && prev.method === current.method) {
            combine();
          }
        };

        return new Promise((resolve, reject) => {
          let calls = 0;
          let promises;

          instance.onQueueDrained = () => {
            try {
              expect(calls).to.equal(1);
              expect(promises.length).to.equal(4);
              Promise.all(promises).then(resolve);
            } catch (e) {
              reject(e);
            }
          };

          const method = () => { calls++; };

          promises = [
            instance.enqueue(method),
            instance.enqueue(method),
            instance.enqueue(method),
            instance.enqueue(method),
          ];
        });
      });

      it('Should allow the user to drop calls (and resolve)', () => {
        instance.handleQueueReduction = (prev, current, combine, drop) => {
          const { resolve, reject } = drop();

          expect(resolve).to.be.a('function');
          expect(reject).to.be.a('function');
          resolve();
        };

        return new Promise((resolve, reject) => {
          let calls = 0;
          let promises;

          instance.onQueueDrained = () => {
            try {
              expect(calls).to.equal(0);
              expect(promises.length).to.equal(4);
            } catch (e) {
              reject(e);
            }

            Promise.all(promises).then(resolve);
          };

          const method = () => { calls++; };

          promises = [
            instance.enqueue(method),
            instance.enqueue(method),
            instance.enqueue(method),
            instance.enqueue(method),
          ];
        });
      });

      it('Should allow the user to drop calls (and reject)', () => {
        instance.handleQueueReduction = (prev, current, combine, drop) => {
          const { resolve, reject } = drop();

          expect(resolve).to.be.a('function');
          expect(reject).to.be.a('function');
          reject(new Error('foobar'));
        };

        return new Promise((resolve, reject) => {
          let calls = 0;
          let promises;

          instance.onQueueDrained = () => {
            try {
              expect(calls).to.equal(0);
              expect(promises.length).to.equal(4);
            } catch (e) {
              reject(e);
            }

            Promise.all(promises)
              .then(() => { throw new Error('Expected this to throw...'); })
              .catch((e) => {
                expect(e.message).to.equal('foobar');
                resolve();
              });
          };

          const method = () => { calls++; };

          promises = [
            instance.enqueue(method),
            instance.enqueue(method),
            instance.enqueue(method),
            instance.enqueue(method),
          ];
        });
      });

      it('Should throw if the user both combines and drop a call', () => {
        instance.handleQueueReduction = (prev, current, combine, drop) => {
          if (prev) {
            const { resolve, reject } = drop();
            expect(resolve).to.be.a('function');
            expect(reject).to.be.a('function');
          }

          if (prev) combine();
        };

        return Promise.all([
          instance.enqueue(noop),
          instance.enqueue(noop),
          instance.enqueue(noop),
          instance.enqueue(noop),
        ]).then(() => {
          throw new Error('Expected test to throw...');
        }).catch((e) => {
          expect(e.message).to.equal('Cannot both combine and drop an enqueued method call.');
        });
      });

      it('Should throw if the user attempt to combine with `null`', () => {
        instance.handleQueueReduction = (prev, current, combine) => {
          combine();
        };

        return Promise.all([
          instance.enqueue(noop),
          instance.enqueue(noop),
          instance.enqueue(noop),
          instance.enqueue(noop),
        ]).then(() => {
          throw new Error('Expected test to throw...');
        }).catch((e) => {
          expect(e.message).to.equal('Cannot combine queued method calls without a previous value.');
        });
      });
    });
  });

  describe('Queue Prioritization', () => {
    let instance;

    beforeEach(() => {
      instance = new PromiseQueue();
    });

    it('Should prioritize methods (fifo)', (done) => {
      const results = [];

      const method0 = () => results.push(0);
      const method10 = () => results.push(10);
      const method100 = () => results.push(100);
      const methodNeg10 = () => results.push(-10);

      instance.enqueue(method0, { priority: 0 });
      instance.enqueue(methodNeg10, { priority: -10 });
      instance.enqueue(method10, { priority: 10 });
      instance.enqueue(method100, { priority: 100 });
      instance.enqueue(method0, { priority: 0 });
      instance.enqueue(methodNeg10, { priority: -10 });
      instance.enqueue(method10, { priority: 10 });
      instance.enqueue(method100, { priority: 100 });
      instance.enqueue(method0, { priority: 0 });
      instance.enqueue(methodNeg10, { priority: -10 });
      instance.enqueue(method10, { priority: 10 });
      instance.enqueue(method100, { priority: 100 });

      instance.onQueueDrained = () => {
        try {
          expect(results).to.eql([
            100,
            100,
            100,
            10,
            10,
            10,
            0,
            0,
            0,
            -10,
            -10,
            -10,
          ]);

          done();
        } catch (e) {
          done(e);
        }
      };
    });

    it('Should prioritize methods (fifo, async)', (done) => {
      const results = [];

      const method0 = () => delay(10).then(() => results.push(0));
      const method10 = () => delay(10).then(() => results.push(10));
      const method100 = () => delay(10).then(() => results.push(100));
      const methodNeg10 = () => delay(10).then(() => results.push(-10));

      instance.enqueue(method0, { priority: 0 });
      instance.enqueue(methodNeg10, { priority: -10 });
      instance.enqueue(method10, { priority: 10 });
      instance.enqueue(method100, { priority: 100 });
      instance.enqueue(method0, { priority: 0 });
      instance.enqueue(methodNeg10, { priority: -10 });
      instance.enqueue(method10, { priority: 10 });
      instance.enqueue(method100, { priority: 100 });
      instance.enqueue(method0, { priority: 0 });
      instance.enqueue(methodNeg10, { priority: -10 });
      instance.enqueue(method10, { priority: 10 });
      instance.enqueue(method100, { priority: 100 });

      instance.onQueueDrained = () => {
        try {
          expect(results).to.eql([
            100,
            100,
            100,
            10,
            10,
            10,
            0,
            0,
            0,
            -10,
            -10,
            -10,
          ]);

          done();
        } catch (e) {
          done(e);
        }
      };
    });

    it('Should prioritize methods (lifo)', (done) => {
      instance.lifo = true;

      const results = [];

      const method0 = () => results.push(0);
      const method10 = () => results.push(10);
      const method100 = () => results.push(100);
      const methodNeg10 = () => results.push(-10);

      instance.enqueue(method0, { priority: 0 });
      instance.enqueue(methodNeg10, { priority: -10 });
      instance.enqueue(method10, { priority: 10 });
      instance.enqueue(method100, { priority: 100 });
      instance.enqueue(method0, { priority: 0 });
      instance.enqueue(methodNeg10, { priority: -10 });
      instance.enqueue(method10, { priority: 10 });
      instance.enqueue(method100, { priority: 100 });
      instance.enqueue(method0, { priority: 0 });
      instance.enqueue(methodNeg10, { priority: -10 });
      instance.enqueue(method10, { priority: 10 });
      instance.enqueue(method100, { priority: 100 });

      instance.onQueueDrained = () => {
        try {
          expect(results).to.eql([
            -10,
            -10,
            -10,
            0,
            0,
            0,
            10,
            10,
            10,
            100,
            100,
            100,
          ]);
          done();
        } catch (e) {
          done(e);
        }
      };
    });
  });
});
