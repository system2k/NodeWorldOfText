CREATE TABLE channels (
	id integer NOT NULL PRIMARY KEY,
	name integer,
	properties text,
	description text,
	date_created integer,
	world_id integer
);

CREATE TABLE entries (
	id integer NOT NULL PRIMARY KEY,
	date integer,
	channel integer,
	data text
);

CREATE TABLE default_channels (
	channel_id integer,
	world_id integer
);

CREATE TABLE local_group_principal (
	world_id integer NOT NULL
);

CREATE TABLE local_group_connecting (
	world_id integer NOT NULL,
	channel_id integer NOT NULL,
	is_enabled integer,
	has_accepted integer
);

CREATE INDEX chan_default ON default_channels (world_id, channel_id);
CREATE INDEX chan_id ON channels (world_id, id);
CREATE INDEX ent_id ON entries (channel, id DESC);
CREATE INDEX ent_date ON entries (channel, date);
CREATE INDEX ent_channel ON entries (channel);
CREATE INDEX lcg_prin ON local_group_principal(world_id);
CREATE INDEX lcg_conn ON local_group_connecting(world_id, channel_id);
