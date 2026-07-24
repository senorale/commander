export async function runView(): Promise<number> {
  const { runTUI } = await import('../tui/index.js');
  return runTUI();
}
