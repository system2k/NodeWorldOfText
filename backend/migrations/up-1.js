var nextVersion = 2;
async function migrate(server) {
	var updateServerSetting = server.updateServerSetting;
	var db = server.db;

	//await db.run("ALTER TABLE tile ADD COLUMN revision INTEGER DEFAULT 0");
	//await db.run("CREATE INDEX tiles_rev ON tile (revision)");

	// update database version
	await updateServerSetting("dbVersion", nextVersion.toString());
}
module.exports = {
	migrate
};