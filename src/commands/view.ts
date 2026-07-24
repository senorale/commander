export async function runView(opts: { theme?: string } = {}): Promise<number> {
  const { runTUI } = await import('../tui/index.js');
  return runTUI(opts);
}
