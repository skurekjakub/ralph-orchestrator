// Neo4j schema initialization for Ralphchives GraphRAG
//
// Applied on first Neo4j startup via /docker-entrypoint-initdb.d/.
// Idempotent — safe to re-run.

// ---- Uniqueness constraints (also create implicit indexes) ----

CREATE CONSTRAINT user_uid IF NOT EXISTS
  FOR (u:User) REQUIRE u.uid IS UNIQUE;

CREATE CONSTRAINT post_pid IF NOT EXISTS
  FOR (p:Post) REQUIRE p.pid IS UNIQUE;

CREATE CONSTRAINT topic_tid IF NOT EXISTS
  FOR (t:Topic) REQUIRE t.tid IS UNIQUE;

CREATE CONSTRAINT category_cid IF NOT EXISTS
  FOR (c:Category) REQUIRE c.cid IS UNIQUE;

CREATE CONSTRAINT tag_name IF NOT EXISTS
  FOR (t:Tag) REQUIRE t.name IS UNIQUE;

CREATE CONSTRAINT entity_name_type IF NOT EXISTS
  FOR (e:Entity) REQUIRE (e.name, e.type) IS UNIQUE;

CREATE CONSTRAINT sync_state_key IF NOT EXISTS
  FOR (s:SyncState) REQUIRE s.key IS UNIQUE;

// ---- Performance indexes ----

CREATE INDEX post_timestamp IF NOT EXISTS
  FOR (p:Post) ON (p.timestamp);

CREATE INDEX topic_timestamp IF NOT EXISTS
  FOR (t:Topic) ON (t.timestamp);

// ---- Fulltext indexes (for entity resolution) ----

CREATE FULLTEXT INDEX entity_fulltext IF NOT EXISTS
  FOR (e:Entity) ON EACH [e.name, e.description];

// ---- Vector indexes (for semantic search) ----
// bge-m3 produces 1024-dimensional embeddings

CREATE VECTOR INDEX post_embeddings IF NOT EXISTS
  FOR (p:Post) ON (p.embedding)
  OPTIONS {indexConfig: {
    `vector.dimensions`: 1024,
    `vector.similarity_function`: 'cosine'
  }};

CREATE VECTOR INDEX entity_embeddings IF NOT EXISTS
  FOR (e:Entity) ON (e.embedding)
  OPTIONS {indexConfig: {
    `vector.dimensions`: 1024,
    `vector.similarity_function`: 'cosine'
  }};
