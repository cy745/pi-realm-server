declare module 'stats.js' {
  interface Stats {
    dom: HTMLDivElement;
    showPanel(panel: number): void;
    begin(): void;
    end(): void;
  }
  const Stats: new () => Stats;
  export default Stats;
}
