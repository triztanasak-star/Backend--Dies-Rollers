CREATE TABLE IF NOT EXISTS public.digital_works (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    project_id INT,
    assigned_to INT,
    assistant VARCHAR(255)
);

-- Đảm bảo ép thêm khóa chính nếu bảng đã tồn tại từ trước mà chưa có
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE t.relname = 'digital_works' AND c.contype = 'p'
    ) THEN
        ALTER TABLE public.digital_works ADD PRIMARY KEY (id);
    END IF;
END $$;

