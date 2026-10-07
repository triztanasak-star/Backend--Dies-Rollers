-- File: 003_create_digital_works.sql
CREATE TABLE IF NOT EXISTS public.digital_works (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),          -- Giữ lại cột cũ để tương thích ngược
    project_id INT,              -- Giữ lại cột cũ
    assigned_to INT,
    assistant VARCHAR(255),
    
    -- Các cột bổ sung theo yêu cầu của code Backend
    task_name VARCHAR(255),
    description TEXT,
    plant VARCHAR(255),
    priority VARCHAR(50),
    lead_project INT,
    support_id INT,
    status VARCHAR(50) DEFAULT 'pending',
    progress_percent INTEGER DEFAULT 0,
    start_date DATE,
    deadline DATE,
    finance_fields JSONB,
    workflow_status VARCHAR(50),
    
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
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

