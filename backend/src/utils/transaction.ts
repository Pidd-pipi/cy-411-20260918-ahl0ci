import { DataSource, EntityManager } from 'typeorm';

const SERIALIZATION_ERROR_CODES = ['ER_LOCK_DEADLOCK', 1213, 1205, '40001'];

function isSerializationFailure(error: unknown): boolean {
  const err = error as { code?: string | number; errno?: number; sqlState?: string };
  if (!err) return false;
  return (
    SERIALIZATION_ERROR_CODES.includes(err.code as string) ||
    SERIALIZATION_ERROR_CODES.includes(err.errno as number) ||
    err.sqlState === '40001'
  );
}

/**
 * Run a unit of work in a transaction and transparently retry it when InnoDB
 * reports a deadlock / lock-wait serialization failure. Combined with the
 * pessimistic quota-row lock this ensures concurrent writers in the same
 * region/month are simply serialised instead of surfacing a failure.
 */
export async function runSerializableTransaction<T>(
  dataSource: DataSource,
  work: (manager: EntityManager) => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await dataSource.transaction(work);
    } catch (error) {
      lastError = error;
      if (!isSerializationFailure(error) || attempt === attempts - 1) {
        throw error;
      }
    }
  }
  throw lastError;
}
