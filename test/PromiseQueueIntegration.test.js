import { expect } from 'chai';
import { exec } from 'child_process';
import PromiseQueue from '../src/PromiseQueue';

const execAsync = (...args) => new Promise((resolve, reject) => (
  exec(...args, (err, results) => (err ? reject(err) : resolve(results)))
));

describe('Integration', () => {
  let queuedExec;

  beforeEach(() => {
    queuedExec = PromiseQueue.queueify(execAsync);
  });

  it('Should only run one command at a time (in order)', () => Promise.all([
    queuedExec('ls', { cwd: __dirname }),
    queuedExec('touch test.txt', { cwd: __dirname }),
    queuedExec('ls', { cwd: __dirname }),
    queuedExec('rm ./test.txt', { cwd: __dirname }),
    queuedExec('ls', { cwd: __dirname }),
  ]).then(([a, b, c, d, e]) => {
    expect(a.trim().split(/\r?\n+/g)).to.eql([
      'PromiseQueue.test.js',
      'PromiseQueueIntegration.test.js',
      'mocha.opts',
    ]);
    expect(b.trim()).to.equal('');
    expect(c.trim().split(/\r?\n+/g)).to.eql([
      'PromiseQueue.test.js',
      'PromiseQueueIntegration.test.js',
      'mocha.opts',
      'test.txt',
    ]);
    expect(d.trim()).to.eql('');
    expect(e.trim().split(/\r?\n+/g)).to.eql([
      'PromiseQueue.test.js',
      'PromiseQueueIntegration.test.js',
      'mocha.opts',
    ]);
  }));
});
