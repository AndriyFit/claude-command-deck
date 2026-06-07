import * as vscode from 'vscode';

export function insertIntoTerminal(invocation: string): void {
  const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal('Claude');
  terminal.show();
  // second arg `false` = do NOT append a newline → command is typed but not run
  terminal.sendText(invocation, false);
}
