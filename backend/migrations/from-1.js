var nextVersion = 2;
async function migrate(server) {
	var updateServerSetting = server.updateServerSetting;
	var db = server.db;
	var db_chat = server.db_chat;

	//await db.run("ALTER TABLE tile ADD COLUMN revision INTEGER DEFAULT 0");
	//await db.run("CREATE INDEX tiles_rev ON tile (revision)");

	await db_chat.run(`BEGIN`);

	await db_chat.run(`
	CREATE TABLE local_group_principal (
		world_id integer NOT NULL
	)
	`);

	await db_chat.run(`
	CREATE TABLE local_group_connecting (
		world_id integer NOT NULL,
		channel_id integer NOT NULL,
		is_enabled integer,
		has_accepted integer
	)
	`);

	await db_chat.run(`CREATE INDEX lcg_prin ON local_group_principal(world_id)`);
	await db_chat.run(`CREATE INDEX lcg_conn ON local_group_connecting(world_id, channel_id)`);

	await db_chat.run(`COMMIT`);

	// update database version
	await updateServerSetting("dbVersion", nextVersion.toString());
}
module.exports = {
	migrate
};