import readline from 'node:readline';

// Shared interactive prompt for manual, secret-handling scripts.
// Queues piped/typed lines so lines arriving in the same chunk are not lost,
// and suppresses terminal echo while a hidden (password) question is active.

export interface Prompt {
  ask(query: string, options?: { hidden?: boolean }): Promise<string>;
  close(): void;
}

type MutableReadline = readline.Interface & {
  _writeToOutput: (chunk: string) => void;
};

export function createPrompt(): Prompt {
  const mutable = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY === true,
  }) as MutableReadline;

  let muted = false;
  const originalWrite = mutable._writeToOutput.bind(mutable);
  mutable._writeToOutput = (chunk: string) => {
    if (muted) {
      if (chunk.includes('\n') || chunk.includes('\r')) {
        originalWrite('\n');
      }
      return;
    }
    originalWrite(chunk);
  };

  const queue: string[] = [];
  let waiter: ((line: string) => void) | null = null;

  mutable.on('line', (line) => {
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve(line);
    } else {
      queue.push(line);
    }
  });

  async function ask(query: string, options: { hidden?: boolean } = {}): Promise<string> {
    muted = options.hidden ?? false;
    process.stdout.write(query);
    const line = await new Promise<string>((resolve) => {
      const queued = queue.shift();
      if (queued !== undefined) {
        resolve(queued);
      } else {
        waiter = resolve;
      }
    });
    muted = false;
    return line.trim();
  }

  function close() {
    mutable.close();
  }

  return { ask, close };
}
