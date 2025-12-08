module.exports = async function(ws, data, send, broadcast, server, ctx) {
	var chat_mgr = server.chat_mgr;
	var ipHeaderAddr = ws.sdata.ipAddress;
	var tell_blocks = chat_mgr.tell_blocks;

	ws.sdata.chat_blocks.id.splice(0);
	ws.sdata.chat_blocks.user.splice(0);
	ws.sdata.chat_blocks.block_all = false;
	ws.sdata.chat_blocks.no_tell = false;
	ws.sdata.chat_blocks.no_anon = false;
	ws.sdata.chat_blocks.no_reg = false;

	var tblocks = tell_blocks[ipHeaderAddr];
	if(tblocks) {
		for(var b in tblocks) {
			delete tblocks[b];
		}
	}
}
