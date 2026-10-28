## Catch-up timing check against a city-sized fake street grid (not part of CI).
## Run: DELAY=3 AWAY_H=24 godot --headless -s res://tests/sim/run_sim.gd
extends SceneTree
const Main := preload("res://scripts/main.gd")
const GridApi := preload("res://tests/sim/grid_api.gd")
const DiskCache := preload("res://scripts/disk_cache.gd")
var m
var t := 0.0
var api
func _init():
	DiskCache.new("user://sim_streets/").clear()
	DirAccess.remove_absolute("user://sim_save.json")
	api = GridApi.new()
	api.delay_s = float(OS.get_environment("DELAY") if OS.get_environment("DELAY") != "" else "3")
	m = Main.new()
	m.api = api
	m.save_path = "user://sim_save.json"
	m.street_cache_dir = "user://sim_streets/"
	m.offline_tiles = true
	root.add_child(m)
	process_frame.connect(_tick)
var emitted := false
var started := false
var next_log := 0.0
var t0 := 0
func _tick():
	if not emitted:
		emitted = true
		m.hud.city_chosen.emit("Sim", 42.0, 23.0, [41.9, 22.85, 42.1, 23.15])
	if m.walker == null: return
	if not started:
		started = true
		m.last_tick -= float(OS.get_environment("AWAY_H") if OS.get_environment("AWAY_H") != "" else "24") * 3600.0
		t0 = Time.get_ticks_msec()
		return
	var el := (Time.get_ticks_msec() - t0) / 1000.0
	if el >= next_log:
		next_log += 5.0
		print("t=%5.1fs owed=%7.1f km walked=%7.1f km cells=%d inflight=%d calls=%d needs_data=%s catching=%s" % [el, m.pending_m/1000.0, m.walker.total_m/1000.0, m.walker.graph.cells.size(), m.loader.in_flight_count(), api.calls, m.walker.needs_data(), m.is_catching_up()])
	if (not m.is_catching_up() and el > 1.0) or el > 240.0:
		print("DONE at %.1fs, walked %.1f km, cells %d, calls %d" % [el, m.walker.total_m/1000.0, m.walker.graph.cells.size(), api.calls])
		quit()
