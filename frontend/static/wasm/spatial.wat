(module
  (memory (export "memory") 1)

  (func $floor_tile (param $value f64) (param $tile i32) (result i32)
    local.get $value
    local.get $tile
    f64.convert_i32_s
    f64.div
    f64.floor
    i32.trunc_f64_s)

  (func $write_range
    (param $positionX f64) (param $positionY f64)
    (param $viewportW i32) (param $viewportH i32)
    (param $tileW i32) (param $tileH i32)
    (param $margin i32) (param $buffer i32) (param $out i32)
    (local $halfW i32) (local $halfH i32)
    (local $startX i32) (local $startY i32)
    (local $endX i32) (local $endY i32)

    local.get $viewportW
    i32.const 2
    i32.div_s
    local.set $halfW
    local.get $viewportH
    i32.const 2
    i32.div_s
    local.set $halfH

    i32.const 0
    local.get $margin
    i32.sub
    local.get $halfW
    i32.sub
    f64.convert_i32_s
    local.get $positionX
    f64.sub
    local.get $tileW
    call $floor_tile
    local.get $buffer
    i32.sub
    local.set $startX

    i32.const 0
    local.get $margin
    i32.sub
    local.get $halfH
    i32.sub
    f64.convert_i32_s
    local.get $positionY
    f64.sub
    local.get $tileH
    call $floor_tile
    local.get $buffer
    i32.sub
    local.set $startY

    local.get $viewportW
    i32.const 1
    i32.sub
    local.get $margin
    i32.add
    local.get $halfW
    i32.sub
    f64.convert_i32_s
    local.get $positionX
    f64.sub
    local.get $tileW
    call $floor_tile
    local.get $buffer
    i32.add
    local.set $endX

    local.get $viewportH
    i32.const 1
    i32.sub
    local.get $margin
    i32.add
    local.get $halfH
    i32.sub
    f64.convert_i32_s
    local.get $positionY
    f64.sub
    local.get $tileH
    call $floor_tile
    local.get $buffer
    i32.add
    local.set $endY

    local.get $out
    local.get $startX
    i32.store
    local.get $out
    i32.const 4
    i32.add
    local.get $startY
    i32.store
    local.get $out
    i32.const 8
    i32.add
    local.get $endX
    i32.store
    local.get $out
    i32.const 12
    i32.add
    local.get $endY
    i32.store)

  (func (export "getTileRange")
    (param $positionX f64) (param $positionY f64)
    (param $viewportW i32) (param $viewportH i32)
    (param $tileW i32) (param $tileH i32)
    (param $margin i32) (param $buffer i32) (param $out i32)
    local.get $positionX
    local.get $positionY
    local.get $viewportW
    local.get $viewportH
    local.get $tileW
    local.get $tileH
    local.get $margin
    local.get $buffer
    local.get $out
    call $write_range)

  (func (export "tileInRange")
    (param $tileX i32) (param $tileY i32)
    (param $minX i32) (param $minY i32)
    (param $maxX i32) (param $maxY i32)
    (result i32)
    local.get $tileX
    local.get $minX
    i32.ge_s
    local.get $tileX
    local.get $maxX
    i32.le_s
    i32.and
    local.get $tileY
    local.get $minY
    i32.ge_s
    i32.and
    local.get $tileY
    local.get $maxY
    i32.le_s
    i32.and)
)
