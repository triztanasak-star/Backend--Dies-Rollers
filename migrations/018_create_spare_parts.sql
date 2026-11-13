CREATE TABLE IF NOT EXISTS spare_parts (
  id SERIAL PRIMARY KEY,
  system TEXT NOT NULL,
  equipment TEXT NOT NULL,
  specifications TEXT NOT NULL DEFAULT '',
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  in_use_quantity INTEGER NOT NULL DEFAULT 0 CHECK (in_use_quantity >= 0),
  supplier TEXT NOT NULL DEFAULT '',
  price_vnd NUMERIC NOT NULL DEFAULT 0 CHECK (price_vnd >= 0),
  standard_ton NUMERIC NOT NULL DEFAULT 0 CHECK (standard_ton >= 0),
  life_ton NUMERIC NOT NULL DEFAULT 0 CHECK (life_ton >= 0),
  line_in_use TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  image_before TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Trong kho' CHECK (status IN ('Trong kho', 'Đang sử dụng', 'Hết tuổi thọ', 'Hư bể', 'Đang đặt')),
  note TEXT NOT NULL DEFAULT ''
);
