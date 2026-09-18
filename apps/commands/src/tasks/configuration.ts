import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { ConfigurationChecker } from '@contentfactory/helpers/configuration/configuration.checker';

@Injectable()
export class ConfigurationTask {
  @Command({
    command: 'config:check',
    describe: 'Checks your configuration (.env) file for issues.',
  })
  create() {
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
    return true;
  }
}
