import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Lock } from '../schemas/lock.schema.js';

const LOCK_ID = 'ingestion';

@Injectable()
export class IngestionLockRepository {
  constructor(
    @InjectModel(Lock.name) private readonly lockModel: Model<Lock>,
  ) {}

  async acquire(owner: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    const lease = { owner, expiresAt: new Date(now.getTime() + ttlMs) };

    const takeover = await this.lockModel
      .updateOne({ _id: LOCK_ID, expiresAt: { $lt: now } }, { $set: lease })
      .exec();
    if (takeover.matchedCount === 1) {
      return true;
    }

    const { upsertedCount } = await this.lockModel
      .updateOne({ _id: LOCK_ID }, { $setOnInsert: lease }, { upsert: true })
      .exec();

    return upsertedCount === 1;
  }

  async extend(owner: string, ttlMs: number): Promise<boolean> {
    const { matchedCount } = await this.lockModel
      .updateOne(
        { _id: LOCK_ID, owner },
        { $set: { expiresAt: new Date(Date.now() + ttlMs) } },
      )
      .exec();

    return matchedCount === 1;
  }

  async release(owner: string): Promise<void> {
    await this.lockModel.deleteOne({ _id: LOCK_ID, owner }).exec();
  }
}
