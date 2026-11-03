import { MongoClient } from 'mongodb';
if (!process.env.MONGODB_URI) {
  console.error('BLOCKED: MONGODB_URI is not configured. No records were read or changed.');
  process.exitCode = 2;
} else {
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db();
    const report = {};
    for (const [collection, currency, amount] of [
      ['users','wallet.currency','wallet.balance'], ['rides','fare.currency','fare.total'],
      ['payments','currency','amount'], ['wallettransactions','currency','amount'],
      ['pricingrules','currency','baseFare'], ['drivers','stats.currency','stats.totalEarnings'],
    ]) {
      report[collection] = await db.collection(collection).aggregate([
        { $group: { _id: { $ifNull: [`$${currency}`, 'UNVERIFIED'] }, count: { $sum: 1 }, sum: { $sum: `$${amount}` } } },
      ]).toArray();
    }
    console.log(JSON.stringify({ readOnly: true, groups: report }, null, 2));
  } catch {
    console.error('Inventory failed. Check connection access; connection details were not logged.');
    process.exitCode = 2;
  } finally { await client.close(); }
}
