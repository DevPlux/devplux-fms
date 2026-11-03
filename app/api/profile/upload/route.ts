import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import fs from 'fs';
import path from 'path';

// Allowed MIME types and extensions for avatars
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
];

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = (formData.get('file') || formData.get('avatar')) as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No image file provided.' }, { status: 400 });
    }

    // 1. File size check
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Image file size exceeds 5MB limit. Please upload a smaller image.' },
        { status: 400 }
      );
    }

    // 2. MIME type & Extension check
    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.')) || '.png';
    const isExtensionAllowed = ALLOWED_EXTENSIONS.includes(fileExtension);
    const isMimeAllowed = ALLOWED_MIME_TYPES.includes(file.type.toLowerCase()) || isExtensionAllowed;

    if (!isMimeAllowed) {
      return NextResponse.json(
        {
          error: `Unsupported image format (${file.type || fileExtension}). Allowed formats: JPG, PNG, WEBP, GIF.`,
        },
        { status: 400 }
      );
    }

    const fileArrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(fileArrayBuffer);
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const uniqueFileName = `${timestamp}_${sanitizedName}`;

    // 3. Attempt Supabase Storage Upload
    try {
      const adminSupabase = createAdminClient();

      // Ensure 'avatars' bucket exists or try 'receipts' bucket
      let targetBucket = 'avatars';
      try {
        const { data: buckets } = await adminSupabase.storage.listBuckets();
        const hasAvatars = buckets?.some((b) => b.name === 'avatars');
        if (!hasAvatars) {
          const { error: createErr } = await adminSupabase.storage.createBucket('avatars', {
            public: true,
            fileSizeLimit: MAX_FILE_SIZE,
            allowedMimeTypes: ALLOWED_MIME_TYPES,
          });
          if (createErr) {
            // Fallback to existing 'receipts' bucket with avatars folder
            targetBucket = 'receipts';
          }
        }
      } catch {
        targetBucket = 'receipts';
      }

      const storagePath = targetBucket === 'avatars' ? uniqueFileName : `avatars/${uniqueFileName}`;

      const { error: uploadError } = await adminSupabase.storage
        .from(targetBucket)
        .upload(storagePath, fileBuffer, {
          contentType: file.type || 'image/png',
          upsert: true,
          cacheControl: '3600',
        });

      if (!uploadError) {
        const { data: publicUrlData } = adminSupabase.storage
          .from(targetBucket)
          .getPublicUrl(storagePath);

        if (publicUrlData?.publicUrl) {
          return NextResponse.json({
            success: true,
            url: publicUrlData.publicUrl,
            source: 'supabase-storage',
          });
        }
      } else {
        console.warn('Supabase storage upload returned notice, applying fallback:', uploadError.message);
      }
    } catch (storageErr: any) {
      console.warn('Notice in Supabase storage, using filesystem fallback:', storageErr?.message);
    }

    // 4. Fallback: Save to public/uploads/avatars/
    try {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const localFilePath = path.join(uploadDir, uniqueFileName);
      fs.writeFileSync(localFilePath, fileBuffer);

      const localPublicUrl = `/uploads/avatars/${uniqueFileName}`;
      return NextResponse.json({
        success: true,
        url: localPublicUrl,
        source: 'local-filesystem',
      });
    } catch (fsErr) {
      console.warn('Filesystem write notice, falling back to data URL:', fsErr);
    }

    // 5. Ultimate fallback: Base64 data URL
    const mime = file.type || 'image/png';
    const base64Data = `data:${mime};base64,${fileBuffer.toString('base64')}`;
    return NextResponse.json({
      success: true,
      url: base64Data,
      source: 'data-url',
    });
  } catch (err: any) {
    console.error('Error uploading avatar:', err);
    return NextResponse.json({ error: err.message || 'Image upload failed' }, { status: 500 });
  }
}

