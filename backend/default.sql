CREATE TABLE "auth_user" (
    "id" integer NOT NULL PRIMARY KEY,
    "username" varchar(30) NOT NULL UNIQUE,
    "email" varchar(75) NOT NULL,
    "password" varchar(128) NOT NULL,
    "is_active" bool NOT NULL,
    "level" integer NOT NULL,
    "last_login" integer NOT NULL,
    "date_joined" integer NOT NULL
);

CREATE TABLE "auth_session" (
    "session_key" varchar(40) NOT NULL PRIMARY KEY,
    "session_data" text NOT NULL,
    "expire_date" integer NOT NULL
);

CREATE TABLE "registration_registrationprofile" (
    "id" integer NOT NULL PRIMARY KEY,
    "user_id" integer NOT NULL UNIQUE REFERENCES "auth_user" ("id"),
    "activation_key" varchar(40) NOT NULL
);

CREATE TABLE "tile" (
    "id" integer NOT NULL PRIMARY KEY,
    "world_id" integer NOT NULL REFERENCES "world" ("id"),
    "content" varchar(128) NOT NULL,
    "tileY" integer NOT NULL,
    "tileX" integer NOT NULL,
    "properties" text NOT NULL,
    "writability" integer,
    "created_at" integer NOT NULL,
    UNIQUE ("world_id", "tileY", "tileX")
);

CREATE TABLE "whitelist" (
    "id" integer NOT NULL PRIMARY KEY,
    "user_id" integer NOT NULL REFERENCES "auth_user" ("id"),
    "world_id" integer NOT NULL REFERENCES "world" ("id"),
    "created_at" integer NOT NULL,
    UNIQUE ("user_id", "world_id")
);

CREATE TABLE "world" (
    "id" integer NOT NULL PRIMARY KEY,
    "name" text NOT NULL UNIQUE,
    "owner_id" integer REFERENCES "auth_user" ("id"),
    "created_at" integer NOT NULL,
    "feature_go_to_coord" integer NOT NULL,
    "feature_membertiles_addremove" bool NOT NULL,
    "feature_paste" integer NOT NULL,
    "feature_coord_link" integer NOT NULL,
    "feature_url_link" integer NOT NULL,
    "custom_bg" text NOT NULL,
    "custom_cursor" text NOT NULL,
    "custom_guest_cursor" text NOT NULL,
    "custom_color" text NOT NULL,
    "custom_tile_owner" text NOT NULL,
    "custom_tile_member" text NOT NULL,
    "writability" integer NOT NULL,
    "readability" integer NOT NULL,
    "properties" text NOT NULL
);

CREATE TABLE "scripts" (
    "id" integer NOT NULL PRIMARY KEY,
    "owner_id" integer,
    "name" text NOT NULL,
    "content" text NOT NULL,
    "created_at" integer NOT NULL,
    "enabled" bool NOT NULL
);