CREATE INDEX "edit_0" ON "edit" ("world_id");

CREATE INDEX "edit_1" ON "edit" ("user_id");

CREATE INDEX "edit_2" ON "edit" ("time" ASC);

CREATE INDEX "tile_0" ON "tile" ("world_id");

CREATE INDEX "whitelist_0" ON "whitelist" ("world_id");

CREATE INDEX "whitelist_1" ON "whitelist" ("user_id");

CREATE INDEX "world_0" ON "world" ("owner_id");