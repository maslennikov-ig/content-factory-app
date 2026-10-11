import yargs from 'yargs/yargs';
import {
  commandCatalog,
  configurationStrictOption,
  rerenderApplyOption,
  stripApplyOption,
  adaptationDryRunOption,
} from './command.catalog';
import { ConfigurationTask } from './tasks/configuration';

/** Invoked before importing the operational module or its socket owners. */
export async function runOfflineCommand(args: string[]): Promise<boolean> {
  if (
    args.length > 0 &&
    !args.includes('config:check') &&
    !args.includes('--help') &&
    !args.includes('-h') &&
    !args.includes('--version') &&
    !args.includes('-v')
  )
    return false;

  const cli = yargs(args)
    .scriptName('cli')
    .demandCommand(1)
    .help('h')
    .alias('h', 'help')
    .version()
    .alias('v', 'version')
    .strict()
    .exitProcess(false);
  // Declare the boolean before parsing so it cannot consume the command name.
  if (args.includes('config:check')) {
    cli.option('strict', configurationStrictOption);
  }
  for (const [name, metadata] of Object.entries(commandCatalog)) {
    cli.command({
      ...metadata,
      builder: (command) => {
        if (name === 'configuration') {
          return command.option('strict', configurationStrictOption);
        }
        if (name === 'prune')
          return command.positional('days', { type: 'number' });
        if (name === 'rerender' || name === 'strip') {
          return command
            .option(
              'apply',
              name === 'rerender' ? rerenderApplyOption : stripApplyOption
            )
            .option('dry-run', adaptationDryRunOption);
        }
        return command;
      },
      handler: (argv) => {
        if (name === 'configuration')
          new ConfigurationTask().create(argv['strict'] === true);
      },
    });
  }
  await cli.parseAsync();
  return true;
}
