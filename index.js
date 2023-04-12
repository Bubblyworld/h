#!/usr/bin/env node
import cac from 'cac';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ask } from './gpt.js';
import pico from 'picocolors';

const dataDir = path.join(os.homedir(), '.h-data');
const latestFile = path.join(dataDir, 'latest.json');
const validModels = [
  'gpt-4',
  'gpt-4-0314',
  'gpt-4-32k',
  'gpt-4-32k-0314',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-0301',
];

async function init() {
  try {
    await fs.mkdir(dataDir);
  } catch (err) {
    if (err.code === 'EEXIST') {
      return; // great
    }
    throw err;
  }

  try {
    await fs.readFile(latestFile);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(latestFile, '');
    }
    throw err;
  }
}

const cli = cac(pico.red(pico.bold('h')));

cli
  .version('1.0.0')
  .help(sections => {
    return sections
      .filter(section => section.title !== 'Commands')
      .filter(
        section => !(section.title && section.title.startsWith('For more')),
      )
      .map(section => {
        if (section.title) {
          section.title = pico.bold(section.title);
        }
        return section;
      });
  })
  .command('')
  .usage(
    `[...flags]

Query GPT models from the safety of your terminal.
Unix-friendly for use within bash pipelines.`,
  )
  .option('-m, --model <model>', 'Which GPT model to use', {
    default: 'gpt-3.5-turbo',
  })
  .option('-p, --prompt <prompt>', 'The prompt to send GPT')
  .option('-c, --continue', 'Continue from the last conversation')
  .action(async options => {
    try {
      if (!validModels.includes(options.model)) {
        const formattedModels = validModels.map(m => `  ${m}`).join('\n');
        throw new Error(
          `Model '${options.model}' does not exist, choose one from:\n${formattedModels}`,
        );
      }

      await init();

      let conversation;
      if (options.continue) {
        const latestFile = await fs.readFile(latestFile, { encoding: 'utf-8' });
        if (latestFile) {
          try {
            conversation = JSON.parse(latestFile);
          } catch (err) {
            throw new Error(
              `Expected file "${latestFile}" to contain a JSON-encoded conversation with GPT.`,
              { cause: err },
            );
          }
        }
      }

      if (!options.prompt) {
        options.prompt = await openEditor();
      }

      console.log(await ask(options.prompt, options.model, conversation));
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

cli.parse();

async function openEditor() {
  return new Promise((resolve, reject) => {
    const editor = process.env.EDITOR || 'vi';
    const tmpFile = getTempFilePath('');

    fs.writeFile(tmpFile, 'Replace this file with your prompt.').then(() => {
      const child = spawn(editor, [tmpFile], {
        stdio: 'inherit',
      });

      child.on('exit', code => {
        (async () => {
          if (code === 0) {
            const prompt = await fs.readFile(tmpFile, 'utf-8');
            const newPath = getTempFilePath(prompt);
            await fs.rename(tmpFile, newPath);

            console.log(`Saving prompt to: ${newPath}`);
            resolve(prompt);
          } else {
            reject(new Error(`Editor exited with code: ${code}`));
          }
        })();
      });
    });
  });
}

function sanitizeFileName(input) {
  return input.replace(/[/\\?%*:|"<>]/g, '#').toLowerCase();
}

function getTempFilePath(prompt) {
  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  const words = prompt
    .split(/\s+/)
    .slice(0, 5)
    .map(sanitizeFileName)
    .map(w => w.toLowerCase())
    .join('-');

  return path.join(dataDir, `prompt_${timestamp}_${words}.txt`);
}
