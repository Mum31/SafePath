export function buildForecastTargets(count = 6) {
  const base = new Date();
  base.setMinutes(0, 0, 0);

  return Array.from({ length: count }, (_item, index) => {
    const target = new Date(base.getTime() + index * 60 * 60 * 1000);
    return {
      date: target,
      iso: target.toISOString(),
      hour: target.getHours(),
    };
  });
}
