CREATE TABLE "edit" (
    "user_id" integer REFERENCES "auth_user" ("id"),
    "world_id" integer NOT NULL REFERENCES "world" ("id"),
    "tileY" integer NOT NULL,
    "tileX" integer NOT NULL,
    "time" integer NOT NULL,
    "content" text NOT NULL
);

CREATE INDEX "edit_0" ON "edit" ("world_id");
CREATE INDEX "edit_1" ON "edit" ("user_id");
CREATE INDEX "edit_2" ON "edit" ("time" ASC);