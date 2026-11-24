
import { SalesDocClient } from "./server/client/SalesDocClient.js";

async function run() {
  const client = SalesDocClient.getInstance();
  const cRes = await client.request<{ category: any[] }>("getCategory", { limit: 100 });
  console.log("Categories:", cRes.result?.category?.map(c => ({ id: c.SD_id, name: c.name, code: c.code_1C })));
  process.exit(0);
}
run();
