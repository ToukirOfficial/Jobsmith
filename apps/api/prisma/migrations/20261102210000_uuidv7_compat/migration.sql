-- PostgreSQL 18 has uuidv7() built in. On older servers (16, 17) this adds the same thing: a time-ordered
-- version 7 UUID built from gen_random_uuid() with the millisecond timestamp in the first 48 bits.
-- It does nothing when a uuidv7() function already exists.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uuidv7') THEN
    CREATE FUNCTION uuidv7() RETURNS uuid AS $fn$
      SELECT encode(
        set_bit(set_bit(
          overlay(uuid_send(gen_random_uuid())
            placing substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
            FROM 1 FOR 6),
          52, 1), 53, 1),
        'hex')::uuid
    $fn$ LANGUAGE sql VOLATILE;
  END IF;
END
$$;
