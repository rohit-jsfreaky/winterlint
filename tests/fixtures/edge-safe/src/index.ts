export async function getData(url: string): Promise<unknown> {
  const res = await fetch(url);
  return res.json();
}
