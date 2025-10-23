import { Readable } from 'node:stream';
import { getSafeJson } from '@openpanel/json';
import {
  type Redis,
  getRedisCache,
  getRedisPub,
  publishEvent,
} from '@openpanel/redis';
import { ch } from '../clickhouse/client';
import {
  type IClickhouseEvent,
  type IServiceEvent,
  transformEvent,
} from '../services/event.service';
import { BaseBuffer } from './base-buffer';

export class EventBuffer extends BaseBuffer {
  private batchSize = process.env.EVENT_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_BATCH_SIZE, 10)
    : 4000;
  private chunkSize = process.env.EVENT_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.EVENT_BUFFER_CHUNK_SIZE, 10)
    : 1000;

  private activeVisitorsExpiration = 60 * 5; // 5 minutes
  private lastScreenViewTTL = 60 * 60; // 1 hour

  private readonly redisKey = 'event-buffer';
  private redis: Redis;

  constructor() {
    super({
      name: 'event',
      onFlush: async () => {
        await this.processBuffer();
      },
    });
    this.redis = getRedisCache();
  }

  /**
   * Convert event to CSV row format with headers
   * Order must match the ClickHouse table schema
   */
  private eventToCsvRow(event: IClickhouseEvent): string {
    const escapeCsvValue = (value: any): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // Replace double quotes with single quotes, then escape single quotes by doubling them
      const withSingleQuotes = str.replace(/"/g, "'");
      return `'${withSingleQuotes.replace(/'/g, "''")}'`;
    };

    // Order matches the ClickHouse table schema exactly
    const columns = [
      event.id, // id UUID
      event.name, // name
      event.sdk_name, // sdk_name
      event.sdk_version, // sdk_version
      event.device_id, // device_id
      event.profile_id, // profile_id
      event.project_id, // project_id
      event.session_id, // session_id
      event.path, // path
      event.origin, // origin
      event.referrer, // referrer
      event.referrer_name, // referrer_name
      event.referrer_type, // referrer_type
      event.duration, // duration
      escapeCsvValue(JSON.stringify(event.properties)), // properties
      event.created_at, // created_at
      event.country, // country
      event.city, // city
      event.region, // region
      event.longitude, // longitude
      event.latitude, // latitude
      event.os, // os
      event.os_version, // os_version
      event.browser, // browser
      event.browser_version, // browser_version
      event.device, // device
      event.brand, // brand
      event.model, // model
      event.imported_at, // imported_at
    ];

    return columns.join(',');
  }

  /**
   * Get CSV headers matching the ClickHouse table schema
   */
  private getCsvHeaders(): string {
    return [
      'id',
      'name',
      'sdk_name',
      'sdk_version',
      'device_id',
      'profile_id',
      'project_id',
      'session_id',
      'path',
      'origin',
      'referrer',
      'referrer_name',
      'referrer_type',
      'duration',
      'properties',
      'created_at',
      'country',
      'city',
      'region',
      'longitude',
      'latitude',
      'os',
      'os_version',
      'browser',
      'browser_version',
      'device',
      'brand',
      'model',
      'imported_at',
    ].join(',');
  }

  bulkAdd(events: IClickhouseEvent[]) {
    const multi = this.redis.multi();
    for (const event of events) {
      this.add(event, multi);
    }
    return multi.exec();
  }

  async add(event: IClickhouseEvent, _multi?: ReturnType<Redis['multi']>) {
    try {
      const eventJson = JSON.stringify(event);
      const multi = _multi || this.redis.multi();

      multi.rpush(this.redisKey, eventJson).incr(this.bufferCounterKey);

      // Store last screen_view for event enrichment
      if (event.name === 'screen_view' && event.profile_id) {
        const lastEventKey = this.getLastEventKey({
          projectId: event.project_id,
          profileId: event.profile_id,
        });
        multi.set(lastEventKey, eventJson, 'EX', this.lastScreenViewTTL);
      }

      // Clear last screen_view on session_end
      if (event.name === 'session_end' && event.profile_id) {
        const lastEventKey = this.getLastEventKey({
          projectId: event.project_id,
          profileId: event.profile_id,
        });
        multi.del(lastEventKey);
      }

      if (event.profile_id) {
        this.incrementActiveVisitorCount(
          multi,
          event.project_id,
          event.profile_id,
        );
      }

      if (!_multi) {
        await multi.exec();
      }

      await publishEvent('events', 'received', transformEvent(event));

      // Check buffer length using counter
      const bufferLength = await this.getBufferSize();

      if (bufferLength >= this.batchSize) {
        await this.tryFlush();
      }
    } catch (error) {
      this.logger.error('Failed to add event to Redis buffer', { error });
    }
  }

  /**
   * Retrieve the latest screen_view event for a given project/profile
   * Used for event enrichment - inheriting properties from last screen view
   */
  public async getLastScreenView({
    projectId,
    profileId,
  }: {
    projectId: string;
    profileId: string;
  }): Promise<IServiceEvent | null>;
  public async getLastScreenView({
    projectId,
    sessionId,
  }: {
    projectId: string;
    sessionId: string;
  }): Promise<IServiceEvent | null>;
  public async getLastScreenView({
    projectId,
    profileId,
    sessionId,
  }: {
    projectId: string;
    profileId?: string;
    sessionId?: string;
  }): Promise<IServiceEvent | null> {
    if (profileId) {
      const redis = getRedisCache();
      const eventStr = await redis.get(
        this.getLastEventKey({ projectId, profileId }),
      );
      if (eventStr) {
        const parsed = getSafeJson<IClickhouseEvent>(eventStr);
        if (parsed) {
          return transformEvent(parsed);
        }
      }
    }

    // sessionId lookup not supported in simplified version
    // Events are processed immediately, no session-specific storage
    return null;
  }

  private getLastEventKey({
    projectId,
    profileId,
  }: {
    projectId: string;
    profileId: string;
  }) {
    return `session:last_screen_view:${projectId}:${profileId}`;
  }

  async processBuffer() {
    try {
      // Get events from the start without removing them
      const events = await this.redis.lrange(
        this.redisKey,
        0,
        this.batchSize - 1,
      );

      if (events.length === 0) {
        this.logger.debug('No events to process');
        return;
      }

      const eventsToClickhouse = events
        .map((e) => getSafeJson<IClickhouseEvent>(e))
        .filter((e): e is IClickhouseEvent => e !== null);

      // Sort events by creation time
      eventsToClickhouse.sort(
        (a, b) =>
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime(),
      );

      this.logger.info('Inserting events into ClickHouse', {
        totalEvents: eventsToClickhouse.length,
        chunks: Math.ceil(eventsToClickhouse.length / this.chunkSize),
      });

      // Insert events into ClickHouse in chunks using CSV format with headers
      for (const chunk of this.chunks(eventsToClickhouse, this.chunkSize)) {
        if (process.env.USE_CSV === 'true' || process.env.USE_CSV === '1') {
          // Convert events to CSV format
          const csvRows = chunk.map((event) => this.eventToCsvRow(event));
          const csv = [this.getCsvHeaders(), ...csvRows].join('\n');

          // Create a readable stream in binary mode for CSV
          const csvStream = Readable.from(csv, { objectMode: false });

          await ch.insert({
            table: 'events',
            values: csvStream,
            format: 'CSV',
            clickhouse_settings: {
              input_format_csv_skip_first_lines: '1',
              format_csv_allow_single_quotes: 1,
              format_csv_allow_double_quotes: 1,
            },
          });
        } else {
          await ch.insert({
            table: 'events',
            values: chunk,
            format: 'JSONEachRow',
          });
        }
      }

      // Publish "saved" events
      const pubMulti = getRedisPub().multi();
      for (const event of eventsToClickhouse) {
        await publishEvent('events', 'saved', transformEvent(event), pubMulti);
      }
      await pubMulti.exec();

      // Only remove events after successful insert and update counter
      const multi = this.redis.multi();
      multi
        .ltrim(this.redisKey, events.length, -1)
        .decrby(this.bufferCounterKey, events.length);
      await multi.exec();

      this.logger.info('Processed events from Redis buffer', {
        count: eventsToClickhouse.length,
      });
    } catch (error) {
      this.logger.error('Error processing Redis buffer', { error });
    }
  }

  async getBufferSize() {
    return this.getBufferSizeWithCounter(() => this.redis.llen(this.redisKey));
  }

  private async incrementActiveVisitorCount(
    multi: ReturnType<Redis['multi']>,
    projectId: string,
    profileId: string,
  ) {
    // Track active visitors and emit expiry events when inactive for TTL
    const now = Date.now();
    const zsetKey = `live:visitors:${projectId}`;
    const heartbeatKey = `live:visitor:${projectId}:${profileId}`;
    return multi
      .zadd(zsetKey, now, profileId)
      .set(heartbeatKey, '1', 'EX', this.activeVisitorsExpiration);
  }

  public async getActiveVisitorCount(projectId: string): Promise<number> {
    const redis = getRedisCache();
    const zsetKey = `live:visitors:${projectId}`;
    const cutoff = Date.now() - this.activeVisitorsExpiration * 1000;

    const multi = redis.multi();
    multi
      .zremrangebyscore(zsetKey, '-inf', cutoff)
      .zcount(zsetKey, cutoff, '+inf');

    const [, count] = (await multi.exec()) as [
      [Error | null, any],
      [Error | null, number],
    ];

    return count[1] || 0;
  }
}
