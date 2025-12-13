CREATE TABLE channels (
	id integer NOT NULL PRIMARY KEY,
	name integer,
	properties text,
		/*
			{
				publicAddClass: 0,
				publicAddPass: "",
				staffLockdown: false,
				chatEnabled: true,
				userNotify: true,
				persistentIds: false,
			}
		*/
	description text,
	date_created integer,
	world_id integer,
	is_global integer
);

CREATE TABLE entries (
	id integer NOT NULL PRIMARY KEY,
	date integer,
	channel integer,
	data text
);

/* World vs. Channel: (1 : 0..1) */
CREATE TABLE default_channels (
	channel_id integer,
	world_id integer
);

/* World vs. Channel: (* : *) */
CREATE TABLE global_channel_attachments (
	channel_id integer,
	world_id integer
);

CREATE TABLE channel_staff (
	channel_id integer,
	user_id text,
	properties text
		/*
			{
				canMute: true,
				canLockdown: false,
			}
		*/
);

CREATE TABLE channel_pending (
	target_channel_id integer,
	source_world_id integer,
	is_shadow_blocked integer
);

CREATE TABLE channel_pending_blocks (
	channel_id integer,
	source_user_id text,
	world_id integer,
	original_world_name text
);

CREATE INDEX chan_default ON default_channels (world_id, channel_id);
CREATE INDEX chan_id ON channels (world_id, id);
CREATE INDEX ent_id ON entries (channel, id DESC);
CREATE INDEX ent_date ON entries (channel, date);
CREATE INDEX ent_channel ON entries (channel);
CREATE INDEX gca_byworld ON global_channel_attachments(world_id, channel_id);
CREATE INDEX gca_bychannel ON global_channel_attachments(channel_id, world_id);
CREATE INDEX chan_staff ON channel_staff(channel_id, user_id);
CREATE INDEX chan_staffbyuser ON channel_staff(user_id, channel_id);
CREATE INDEX chan_pend ON channel_pending(target_channel_id, source_world_id);
CREATE INDEX chan_pendbyworld ON channel_pending(source_world_id, target_channel_id);
CREATE INDEX chan_blocked ON channel_pending_blocks(channel_id);
CREATE INDEX chan_blockedworlds ON channel_pending_blocks(world_id, channel_id);
CREATE INDEX chan_blockedusers ON channel_pending_blocks(source_user_id, channel_id);
