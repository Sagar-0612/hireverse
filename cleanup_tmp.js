const { MongoClient, ObjectId } = require('mongodb');
(async () => {
  const client = await MongoClient.connect('mongodb://127.0.0.1:27017/hireverse');
  const db = client.db();
  // reset the two test interviews back to "scheduled" with no analysis, so we can re-test cleanly
  const ids = ['6a266f0bca07a9aec36f5f61', '6a266f68ca07a9aec36f5f64'];
  for (const id of ids) {
    const r = await db.collection('interviews').updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'scheduled' }, $unset: { feedback: '', transcript: '', commScore: '', techScore: '', confidenceScore: '', recommendation: '', transcriptSummary: '', analysis: '' } }
    );
    console.log(id, 'reset', r.modifiedCount);
  }
  await client.close();
})();
