/* global rs, db, sleep */
try { rs.status(); } catch { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] }); }
for (let i = 0; !db.hello().isWritablePrimary; i++) {
  if (i >= 60) throw new Error('Replica primary unavailable');
  sleep(1000);
}
const admin = db.getSiblingDB('admin');
if (!admin.getUser('maxride_staging_admin')) admin.createUser({ user: 'maxride_staging_admin', pwd: process.env.STAGING_MONGO_ADMIN_PASSWORD, roles: ['root'] });
const staging = db.getSiblingDB('maxride_staging');
if (!staging.getUser('maxride_staging')) staging.createUser({ user: 'maxride_staging', pwd: process.env.STAGING_MONGO_PASSWORD, roles: [{ role: 'readWrite', db: 'maxride_staging' }] });
