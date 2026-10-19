const { program } = require('commander');

program
  .name('instadlp')
  .description('Download Instagram posts and highlights for any user.')
  .usage('[options] -t <username> --posts|--highlights')
  .option('-t, --target-user <string>', 'target Instagram username')
  .option('--login-user <username>', 'login username (or set INSTAGRAM_USER env var)')
  .option('--login-password <password>', 'login password (or set INSTAGRAM_PASSWORD env var)')
  .option('--password-stdin', 'read the login password from stdin (keeps it out of shell history)')
  .option('-c, --count <number>', 'number of posts to download (default: 10)', parseInt)
  .option('--posts', 'download posts and reels')
  .option('--highlights', 'download highlights')
  .option('--close-browser', 'close browser after fetching data')
  .option(
    '-P, --persist-session',
    'keep browser open for faster consecutive fetches (closes after 3 min idle)'
  )
  .option('-o, --output-dir <path>', 'output directory for downloaded files (default: ./output)')
  .option('--log-file <path>', 'write logs to a file in addition to console')
  .option('--force-login', 'ignore any existing session and log in again')
  .option('--logout', 'delete the stored Chrome profile and session, then exit')
  .option('--verbose', 'enable debug-level logging');

// Standalone login. Declaring a subcommand means commander needs an explicit
// root action to keep `instadlp --posts -t user` working.
program
  .command('login')
  .description('log in to Instagram and store the session for later runs')
  .option('-u, --user <username>', 'Instagram username (or set INSTAGRAM_USER)')
  .option('-p, --password <password>', 'Instagram password (or set INSTAGRAM_PASSWORD)')
  .option('--password-stdin', 'read the password from stdin (keeps it out of shell history)')
  .option('--force-login', 'clear an existing session first')
  .option('--logout', 'delete the stored Chrome profile instead of logging in')
  .option('--verbose', 'enable debug-level logging')
  .action((cmdOptions) => {
    program.instadlpCommand = 'login';
    program.instadlpCommandOptions = cmdOptions;
  });

program.addHelpText(
  'after',
  `
Examples:
  $ instadlp login --user myuser --password mypass
  $ instadlp login --user myuser --password-stdin < password.txt
  $ instadlp login --logout
  $ instadlp --posts -t testuser
  $ instadlp --highlights -t testuser
  $ instadlp --posts --highlights -t testuser -c 20
  $ instadlp --posts -t testuser -o ./downloads
  $ instadlp --posts -t testuser --verbose --log-file debug.log
  $ instadlp --posts -t private_user --force-login

Commands:
  login              Log in to Instagram and store the session

Environment Variables:
  INSTAGRAM_USER       Login username (fallback for --login-user)
  INSTAGRAM_PASSWORD   Login password (fallback for --login-password)
  CHROME_PATH          Path to Chrome/Chromium executable
  CHROME_PROFILE_DIR   Path to Chrome user data directory

Use at least one mode flag: --posts or --highlights.
`
);

// Root action handles the default scrape invocation.
program.action(() => {
  program.instadlpCommand = 'scrape';
  program.instadlpCommandOptions = {};
});

program.parse();

const options = program.opts();

module.exports = {
  ...options,
  command: program.instadlpCommand || 'scrape',
  commandOptions: program.instadlpCommandOptions || {},
};
