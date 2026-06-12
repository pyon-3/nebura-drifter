extends Node3D

const TRACK_A := 92.0
const TRACK_B := 42.0
const TRACK_WIDTH := 13.0
const MAX_SPEED := 82.0

var car: Node3D
var lead_car: Node3D
var chase_camera: Camera3D
var speed := 0.0
var heading := 0.0
var drift_velocity := Vector3.ZERO
var lead_phase := 0.12
var player_trail: Array[Vector3] = []
var lead_trail: Array[Vector3] = []
var player_trail_mesh: MeshInstance3D
var lead_trail_mesh: MeshInstance3D
var speed_label: Label

func _ready() -> void:
	_build_world()
	car = _make_car(Color("#086477"))
	lead_car = _make_car(Color("#26152c"))
	add_child(car)
	add_child(lead_car)
	car.position = _track_point(0.0)
	lead_car.position = _track_point(lead_phase)
	heading = atan2(_track_tangent(0.0).x, _track_tangent(0.0).z)
	player_trail_mesh = _make_trail(Color(1.0, 0.03, 0.16, 0.45))
	lead_trail_mesh = _make_trail(Color(1.0, 0.02, 0.12, 0.75))
	_build_hud()

func _build_world() -> void:
	var environment := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#030617")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#7088bd")
	env.ambient_light_energy = 0.85
	env.fog_enabled = true
	env.fog_light_color = Color("#081333")
	env.fog_density = 0.004
	environment.environment = env
	add_child(environment)

	var moon := DirectionalLight3D.new()
	moon.light_color = Color("#d9f8ff")
	moon.light_energy = 1.35
	moon.rotation_degrees = Vector3(-48, -35, 0)
	add_child(moon)

	var floor := MeshInstance3D.new()
	var floor_mesh := PlaneMesh.new()
	floor_mesh.size = Vector2(700, 700)
	floor.mesh = floor_mesh
	floor.material_override = _material(Color("#050918"), false)
	add_child(floor)

	for i in 160:
		var phase := float(i) / 160.0
		var point := _track_point(phase)
		var tangent := _track_tangent(phase)
		var road := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(TRACK_WIDTH, 0.08, 4.4)
		road.mesh = box
		road.position = point + Vector3.UP * 0.04
		road.rotation.y = atan2(tangent.x, tangent.z)
		road.material_override = _material(Color("#11182b") if i % 2 else Color("#151d32"), false)
		add_child(road)
		for side in [-1.0, 1.0]:
			var curb := MeshInstance3D.new()
			var curb_mesh := BoxMesh.new()
			curb_mesh.size = Vector3(0.42, 0.1, 2.2)
			curb.mesh = curb_mesh
			var right := Vector3(tangent.z, 0, -tangent.x)
			curb.position = point + right * side * TRACK_WIDTH * 0.5 + Vector3.UP * 0.09
			curb.rotation.y = road.rotation.y
			curb.material_override = _material(Color("#ff3157") if i % 2 else Color("#bdefff"), true)
			add_child(curb)

	for i in 28:
		var phase := float(i) / 28.0
		var gate := Node3D.new()
		var point := _track_point(phase)
		var tangent := _track_tangent(phase)
		gate.position = point
		gate.rotation.y = atan2(tangent.x, tangent.z)
		add_child(gate)
		for side in [-1.0, 1.0]:
			gate.add_child(_box(Vector3(0.18, 6.0, 0.18), Vector3(side * 8.5, 3.0, 0), Color("#54eaff"), true))
		gate.add_child(_box(Vector3(17.2, 0.18, 0.18), Vector3(0, 6.0, 0), Color("#ff4f82") if i % 4 == 0 else Color("#54eaff"), true))

	for i in 46:
		var angle := TAU * float(i) / 46.0
		var radius := 185.0 + sin(i * 2.1) * 24.0
		var height := 14.0 + float((i * 17) % 42)
		var building := _box(Vector3(8, height, 8), Vector3(cos(angle) * radius, height * 0.5, sin(angle) * radius), Color(0.1, 0.48, 0.62, 0.32), false)
		add_child(building)

	chase_camera = Camera3D.new()
	chase_camera.fov = 72
	add_child(chase_camera)

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	speed_label = Label.new()
	speed_label.position = Vector2(30, 28)
	speed_label.add_theme_font_size_override("font_size", 28)
	speed_label.add_theme_color_override("font_color", Color("#baf8ff"))
	layer.add_child(speed_label)
	var help := Label.new()
	help.position = Vector2(30, 66)
	help.text = "W / ↑ GAS   S / ↓ BRAKE   A D / ← → STEER"
	help.add_theme_font_size_override("font_size", 13)
	help.add_theme_color_override("font_color", Color(0.7, 0.9, 1.0, 0.65))
	layer.add_child(help)

func _physics_process(delta: float) -> void:
	var throttle := 1.0 if Input.is_action_pressed("ui_up") or Input.is_key_pressed(KEY_W) else 0.0
	var brake := 1.0 if Input.is_action_pressed("ui_down") or Input.is_key_pressed(KEY_S) else 0.0
	var steer := Input.get_axis("ui_left", "ui_right")
	if Input.is_key_pressed(KEY_A): steer -= 1.0
	if Input.is_key_pressed(KEY_D): steer += 1.0
	steer = clamp(steer, -1.0, 1.0)
	speed = move_toward(speed, MAX_SPEED * throttle, (20.0 if throttle > 0.0 else 8.0) * delta)
	speed = move_toward(speed, 0.0, brake * 42.0 * delta)
	var steer_strength := lerp(1.55, 0.48, clamp(speed / MAX_SPEED, 0.0, 1.0))
	heading -= steer * steer_strength * delta
	var forward := Vector3(sin(heading), 0, cos(heading))
	var right := Vector3(forward.z, 0, -forward.x)
	drift_velocity = drift_velocity.lerp(right * -steer * speed * 0.18, 1.0 - pow(0.02, delta))
	car.position += (forward * speed + drift_velocity) * delta
	drift_velocity *= pow(0.24, delta)
	car.rotation.y = heading
	car.position.y = 0.12

	lead_phase = fmod(lead_phase + delta * 0.056, 1.0)
	var lead_tangent := _track_tangent(lead_phase)
	lead_car.position = _track_point(lead_phase) + Vector3.UP * 0.12
	lead_car.rotation.y = atan2(lead_tangent.x, lead_tangent.z)

	var camera_target := car.position - forward * 7.5 + Vector3.UP * 3.4 - right * drift_velocity.length() * sign(steer) * 0.05
	chase_camera.position = chase_camera.position.lerp(camera_target, 1.0 - pow(0.003, delta))
	chase_camera.look_at(car.position + forward * 13.0 + Vector3.UP * 0.8)
	chase_camera.fov = lerp(chase_camera.fov, 72.0 + speed / MAX_SPEED * 13.0, 1.0 - pow(0.02, delta))

	player_trail.push_front(car.position - forward * 1.8 + Vector3.UP * 0.55)
	lead_trail.push_front(lead_car.position - lead_tangent * 1.8 + Vector3.UP * 0.55)
	if player_trail.size() > 34: player_trail.pop_back()
	if lead_trail.size() > 75: lead_trail.pop_back()
	_update_trail(player_trail_mesh, player_trail, 0.34)
	_update_trail(lead_trail_mesh, lead_trail, 0.52)
	speed_label.text = "%03d KM/H\nNEBURA DRIFTER // GODOT PROTOTYPE" % int(speed * 3.6)

func _track_point(phase: float) -> Vector3:
	var angle := phase * TAU
	return Vector3(cos(angle) * TRACK_A, sin(angle * 2.0) * 1.8, sin(angle) * TRACK_B)

func _track_tangent(phase: float) -> Vector3:
	var angle := phase * TAU
	return Vector3(-sin(angle) * TRACK_A, cos(angle * 2.0) * 7.2, cos(angle) * TRACK_B).normalized()

func _make_car(color: Color) -> Node3D:
	var result := Node3D.new()
	result.add_child(_box(Vector3(1.9, 0.45, 3.4), Vector3(0, 0.52, 0), color, false))
	result.add_child(_box(Vector3(1.35, 0.55, 1.45), Vector3(0, 0.94, -0.2), Color("#153c59"), false))
	for x in [-0.58, 0.58]:
		result.add_child(_box(Vector3(0.46, 0.14, 0.08), Vector3(x, 0.62, -1.75), Color("#ff3157"), true))
		result.add_child(_box(Vector3(0.92, 0.42, 0.03), Vector3(x, 0.62, -1.82), Color(1, 0.02, 0.12, 0.2), true))
	return result

func _box(size: Vector3, position_value: Vector3, color: Color, emission: bool) -> MeshInstance3D:
	var mesh_instance := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh_instance.mesh = mesh
	mesh_instance.position = position_value
	mesh_instance.material_override = _material(color, emission)
	return mesh_instance

func _material(color: Color, emission: bool) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = 0.55
	material.roughness = 0.38
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA if color.a < 1.0 else BaseMaterial3D.TRANSPARENCY_DISABLED
	if emission:
		material.emission_enabled = true
		material.emission = color
		material.emission_energy_multiplier = 2.4
	return material

func _make_trail(color: Color) -> MeshInstance3D:
	var trail := MeshInstance3D.new()
	trail.mesh = ImmediateMesh.new()
	var material := _material(color, true)
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	trail.material_override = material
	add_child(trail)
	return trail

func _update_trail(trail: MeshInstance3D, points: Array[Vector3], width: float) -> void:
	var mesh := trail.mesh as ImmediateMesh
	mesh.clear_surfaces()
	if points.size() < 2: return
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP)
	for i in points.size():
		var tangent := (points[max(0, i - 1)] - points[min(points.size() - 1, i + 1)]).normalized()
		var side := tangent.cross(Vector3.UP).normalized() * width * (1.0 - float(i) / points.size())
		mesh.surface_set_color(Color(1, 1, 1, pow(1.0 - float(i) / points.size(), 2.8)))
		mesh.surface_add_vertex(points[i] - side)
		mesh.surface_add_vertex(points[i] + side)
	mesh.surface_end()
