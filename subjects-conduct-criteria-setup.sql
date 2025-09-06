-- Create subjects table
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create conduct criteria table
CREATE TABLE IF NOT EXISTS conduct_criterias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  max_score INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default subjects if they don't exist
INSERT INTO subjects (name, description) 
SELECT * FROM (
  VALUES 
    ('Mathematics', 'Mathematics and calculations'),
    ('Arabic Language', 'Arabic language and grammar'),
    ('Islamic Studies', 'Islamic knowledge and studies'),
    ('Quran Memorization', 'Quran hafazan and tilawah'),
    ('Science', 'General science subjects'),
    ('English Language', 'English language and communication')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM subjects WHERE subjects.name = v.name);

-- Insert default conduct criteria if they don't exist
INSERT INTO conduct_criterias (name, description, max_score) 
SELECT * FROM (
  VALUES 
    ('Discipline', 'Student behavior and following rules', 100),
    ('Effort', 'Level of effort and participation', 100),
    ('Participation', 'Active participation in class activities', 100),
    ('Motivational Level', 'Student motivation and enthusiasm', 100),
    ('Character', 'Overall character and akhlaq', 100),
    ('Leadership', 'Leadership qualities and initiative', 100)
) AS v(name, description, max_score)
WHERE NOT EXISTS (SELECT 1 FROM conduct_criterias WHERE conduct_criterias.name = v.name);

-- Enable Row Level Security (RLS)
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE conduct_criterias ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for subjects
CREATE POLICY "Allow all users to view subjects" ON subjects FOR SELECT USING (true);
CREATE POLICY "Allow admin to manage subjects" ON subjects FOR ALL USING (
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.raw_user_meta_data->>'role' = 'admin'
  )
);

-- Create RLS policies for conduct criteria
CREATE POLICY "Allow all users to view conduct criteria" ON conduct_criterias FOR SELECT USING (true);
CREATE POLICY "Allow admin to manage conduct criteria" ON conduct_criterias FOR ALL USING (
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.raw_user_meta_data->>'role' = 'admin'
  )
);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_subjects_updated_at 
  BEFORE UPDATE ON subjects 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conduct_criterias_updated_at 
  BEFORE UPDATE ON conduct_criterias 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create dynamic conduct entries table to replace hardcoded columns
-- This table will store conduct scores based on dynamic criteria
CREATE TABLE IF NOT EXISTS conduct_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  criteria_id UUID NOT NULL REFERENCES conduct_criterias(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(exam_id, student_id, teacher_id, criteria_id)
);

-- Enable RLS for conduct_scores
ALTER TABLE conduct_scores ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for conduct_scores
CREATE POLICY "Teachers can manage their own conduct scores" ON conduct_scores FOR ALL USING (
  auth.uid() = teacher_id
);

CREATE POLICY "Admins can view all conduct scores" ON conduct_scores FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.raw_user_meta_data->>'role' = 'admin'
  )
);

-- Create trigger for conduct_scores updated_at
CREATE TRIGGER update_conduct_scores_updated_at 
  BEFORE UPDATE ON conduct_scores 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();