var nextVersion = 2;
async function migrate(server) {
	var db = server.db;
	
	await db.run("ALTER TABLE tile ADD COLUMN revision INTEGER DEFAULT 0");
	await db.run("CREATE INDEX tiles_rev ON tile (revision)");

	// update database version
	await db.run("UPDATE server_info SET value=? WHERE name='db_version'", nextVersion.toString());
}
module.exports = {
	migrate
};