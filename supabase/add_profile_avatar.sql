-- Migration: Add avatar_url to public.profiles table
-- Run this in the Supabase SQL Editor if you wish to store avatars in the profiles table

ALTER TABLE IF EXISTS public.profiles 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN public.profiles.avatar_url IS 'Public URL or storage path to director profile picture';

