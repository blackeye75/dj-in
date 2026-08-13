import { MongoClient, ObjectId } from 'mongodb';
import { SEED_TRACKS } from './seedCatalog';
import { THEME_IDS } from './themes';

/**
 * Data layer.
 *
 * Talks to MongoDB Atlas when MONGODB_URI is configured. When it is not (local
 * demo, preview builds, CI) it falls back to an in-process store seeded with
 * the same catalogue, so every screen and the admin panel stay usable.
 */

const DB_NAME = process.env.MONGODB_DB || 'dj_in';
const uri = process.env.MONGODB_URI;

let clientPromise = null;

function connect() {
  if (!clientPromise) {
    const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
    clientPromise = client.connect().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

/* --------------------------------------------------------- memory fallback */

function memory() {
  if (!globalThis.__djStore) {
    globalThis.__djStore = {
      tracks: SEED_TRACKS.map((t, i) => ({ ...t, _id: `seed-${i}`, createdAt: new Date().toISOString() })),
      meta: { visitors: 0, crowdSize: 320, showName: 'Deluxe Salon — Night Run' },
    };
  }
  return globalThis.__djStore;
}

export function storageMode() {
  return uri ? 'atlas' : 'memory';
}

async function db() {
  if (!uri) return null;
  const client = await connect();
  return client.db(DB_NAME);
}

function normalise(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest };
}

function toObjectId(id) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- seeding */

async function ensureSeeded(database) {
  const col = database.collection('tracks');
  const count = await col.estimatedDocumentCount();
  if (count > 0) return;
  await col.insertMany(SEED_TRACKS.map((t) => ({ ...t, createdAt: new Date().toISOString() })));
  await col.createIndex({ theme: 1, order: 1 });
}

/* ----------------------------------------------------------------- tracks */

export async function listTracks(theme) {
  const filter = theme && THEME_IDS.includes(theme) ? { theme } : {};
  const database = await db();
  if (!database) {
    const rows = memory()
      .tracks.filter((t) => (filter.theme ? t.theme === filter.theme : true))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return rows.map((t) => ({ ...t, id: String(t._id) }));
  }
  await ensureSeeded(database);
  const rows = await database.collection('tracks').find(filter).sort({ order: 1, _id: 1 }).toArray();
  return rows.map(normalise);
}

export async function createTrack(doc) {
  const record = {
    theme: doc.theme,
    title: doc.title,
    artist: doc.artist || 'Unknown artist',
    album: doc.album || '',
    source: doc.source || 'itunes',
    sourceId: doc.sourceId || '',
    query: doc.query || `${doc.title} ${doc.artist || ''}`.trim(),
    previewUrl: doc.previewUrl || '',
    artworkUrl: doc.artworkUrl || '',
    duration: Number(doc.duration) || 0,
    bpm: Number(doc.bpm) || 0,
    lyrics: Array.isArray(doc.lyrics) ? doc.lyrics : [],
    order: Number.isFinite(doc.order) ? doc.order : Date.now() % 100000,
    createdAt: new Date().toISOString(),
  };
  const database = await db();
  if (!database) {
    const m = memory();
    const _id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    m.tracks.push({ ...record, _id });
    return { ...record, id: _id };
  }
  const res = await database.collection('tracks').insertOne(record);
  return { ...record, id: String(res.insertedId) };
}

export async function updateTrack(id, patch) {
  const allowed = ['theme', 'title', 'artist', 'album', 'source', 'sourceId', 'query', 'previewUrl', 'artworkUrl', 'duration', 'bpm', 'lyrics', 'order'];
  const update = {};
  allowed.forEach((k) => {
    if (patch[k] !== undefined) update[k] = patch[k];
  });
  if (!Object.keys(update).length) return null;

  const database = await db();
  if (!database) {
    const m = memory();
    const row = m.tracks.find((t) => String(t._id) === String(id));
    if (!row) return null;
    Object.assign(row, update);
    return { ...row, id: String(row._id) };
  }
  const oid = toObjectId(id);
  if (!oid) return null;
  const res = await database
    .collection('tracks')
    .findOneAndUpdate({ _id: oid }, { $set: update }, { returnDocument: 'after' });
  return normalise(res?.value || res);
}

export async function deleteTrack(id) {
  const database = await db();
  if (!database) {
    const m = memory();
    const before = m.tracks.length;
    m.tracks = m.tracks.filter((t) => String(t._id) !== String(id));
    return m.tracks.length < before;
  }
  const oid = toObjectId(id);
  if (!oid) return false;
  const res = await database.collection('tracks').deleteOne({ _id: oid });
  return res.deletedCount > 0;
}

export async function reorderTracks(ids) {
  const database = await db();
  if (!database) {
    const m = memory();
    ids.forEach((id, i) => {
      const row = m.tracks.find((t) => String(t._id) === String(id));
      if (row) row.order = i;
    });
    return true;
  }
  const ops = ids
    .map((id, i) => {
      const oid = toObjectId(id);
      return oid ? { updateOne: { filter: { _id: oid }, update: { $set: { order: i } } } } : null;
    })
    .filter(Boolean);
  if (ops.length) await database.collection('tracks').bulkWrite(ops);
  return true;
}

/* ------------------------------------------------------------------- meta */

const META_ID = 'show-meta';

export async function getMeta() {
  const database = await db();
  if (!database) return { ...memory().meta };
  const doc = await database.collection('meta').findOne({ _id: META_ID });
  return {
    visitors: doc?.visitors ?? 0,
    crowdSize: doc?.crowdSize ?? 320,
    showName: doc?.showName ?? 'Deluxe Salon — Night Run',
  };
}

export async function bumpVisitors() {
  const database = await db();
  if (!database) {
    const m = memory();
    m.meta.visitors += 1;
    return { ...m.meta };
  }
  const res = await database
    .collection('meta')
    .findOneAndUpdate(
      { _id: META_ID },
      { $inc: { visitors: 1 }, $setOnInsert: { crowdSize: 320, showName: 'Deluxe Salon — Night Run' } },
      { upsert: true, returnDocument: 'after' }
    );
  const doc = res?.value || res;
  return { visitors: doc?.visitors ?? 1, crowdSize: doc?.crowdSize ?? 320, showName: doc?.showName ?? '' };
}

export async function setMeta(patch) {
  const update = {};
  if (patch.crowdSize !== undefined) update.crowdSize = Math.max(0, Number(patch.crowdSize) || 0);
  if (patch.showName !== undefined) update.showName = String(patch.showName).slice(0, 120);
  if (patch.visitors !== undefined) update.visitors = Math.max(0, Number(patch.visitors) || 0);
  if (!Object.keys(update).length) return getMeta();

  const database = await db();
  if (!database) {
    const m = memory();
    Object.assign(m.meta, update);
    return { ...m.meta };
  }
  const res = await database
    .collection('meta')
    .findOneAndUpdate({ _id: META_ID }, { $set: update }, { upsert: true, returnDocument: 'after' });
  const doc = res?.value || res;
  return { visitors: doc?.visitors ?? 0, crowdSize: doc?.crowdSize ?? 0, showName: doc?.showName ?? '' };
}
