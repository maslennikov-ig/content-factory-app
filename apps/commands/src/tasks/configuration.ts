import { commandCatalog, configurationStrictOption } from '../command.catalog';
import { Command, Option } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { ConfigurationChecker } from '@contentfactory/helpers/configuration/configuration.checker';

@Injectable()
export class ConfigurationTask {
  @Command(commandCatalog.configuration)
  create(@Option(configurationStrictOption) strict: boolean = false) {
    const checker = new ConfigurationChecker();
    checker.readEnvFromProcess();
    checker.check();

    if (checker.hasIssues()) {
      for (const issue of checker.getIssues()) {
        console.warn('Configuration issue:', issue);
      }

      console.error(
        'Configuration check complete, issues: ',
        checker.getIssuesCount()
      );
    } else {
      console.log('Configuration check complete, no issues found.');
    }

    // Upstream ended this with "Press Ctrl+C to exit", which was a description
    // of the defect rather than an instruction: the command had finished and
    // the process stayed up. It now ends on its own, so the line would be a
    // lie about what the reader is looking at.
    if (strict && checker.hasIssues()) {
      process.exitCode = 1;
      return false;
    }
    return true;
  }
}
