#!/usr/bin/env bash
# Apply Neo4j schema (constraints, indexes, vector indexes).
# Idempotent — safe to re-run. Uses IF NOT EXISTS on all operations.
#
# Usage: ./apply-schema.sh [neo4j-password]
# Defaults: uri=bolt://localhost:7687, user=neo4j, password=ralphchives

set -euo pipefail

PASSWORD="${1:-${NEO4J_PASSWORD:-ralphchives}}"
URI="${NEO4J_URI:-bolt://localhost:7687}"

echo "Applying Neo4j schema to $URI..."

docker compose exec neo4j cypher-shell -u neo4j -p "$PASSWORD" << 'CYPHER'
CREATE CONSTRAINT user_uid IF NOT EXISTS FOR (u:User) REQUIRE u.uid IS UNIQUE;
CREATE CONSTRAINT post_pid IF NOT EXISTS FOR (p:Post) REQUIRE p.pid IS UNIQUE;
CREATE CONSTRAINT topic_tid IF NOT EXISTS FOR (t:Topic) REQUIRE t.tid IS UNIQUE;
CREATE CONSTRAINT category_cid IF NOT EXISTS FOR (c:Category) REQUIRE c.cid IS UNIQUE;
CREATE CONSTRAINT tag_name IF NOT EXISTS FOR (t:Tag) REQUIRE t.name IS UNIQUE;
CREATE CONSTRAINT entity_name_type IF NOT EXISTS FOR (e:Entity) REQUIRE (e.name, e.type) IS UNIQUE;
CREATE CONSTRAINT sync_state_key IF NOT EXISTS FOR (s:SyncState) REQUIRE s.key IS UNIQUE;
CREATE INDEX post_timestamp IF NOT EXISTS FOR (p:Post) ON (p.timestamp);
CREATE INDEX topic_timestamp IF NOT EXISTS FOR (t:Topic) ON (t.timestamp);
CREATE FULLTEXT INDEX entity_fulltext IF NOT EXISTS FOR (e:Entity) ON EACH [e.name, e.description];
CREATE VECTOR INDEX post_embeddings IF NOT EXISTS FOR (p:Post) ON (p.embedding) OPTIONS {indexConfig: {`vector.dimensions`: 1024, `vector.similarity_function`: 'cosine'}};
CREATE VECTOR INDEX entity_embeddings IF NOT EXISTS FOR (e:Entity) ON (e.embedding) OPTIONS {indexConfig: {`vector.dimensions`: 1024, `vector.similarity_function`: 'cosine'}};
CYPHER

echo "Schema applied successfully."
