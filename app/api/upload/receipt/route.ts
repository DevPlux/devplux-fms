import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Allowed MIME types and extensions
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'video/webm',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webm'];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const BUCKET_NAME = 'receipts';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'general';
    const entityType = formData.get('entityType') as string | null;
    const entityId = formData.get('entityId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No receipt file provided.' }, { status: 400 });
    }

    // 1. File size check
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 25MB limit. Please upload a smaller file.' },
        { status: 400 }
      );
    }

    // 2. MIME type & Extension check
    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));
    const isExtensionAllowed = ALLOWED_EXTENSIONS.includes(fileExtension);
    const isMimeAllowed = ALLOWED_MIME_TYPES.includes(file.type.toLowerCase()) || isExtensionAllowed;

    if (!isMimeAllowed) {
      return NextResponse.json(
        {
          error: `Unsupported file format (${file.type || fileExtension}). Allowed formats: PDF, JPG, JPEG, PNG, WEBM.`,
        },
        { status: 400 }
      );
    }

    // 3. Initialize Supabase Admin Client
    const adminSupabase = createAdminClient();

    // 4. Ensure the storage bucket exists
    try {
      const { data: buckets, error: getBucketError } = await adminSupabase.storage.listBuckets();
      const bucketExists = buckets?.some((b) => b.name === BUCKET_NAME);

      if (!bucketExists) {
        await adminSupabase.storage.createBucket(BUCKET_NAME, {
          public: true,
          fileSizeLimit: MAX_FILE_SIZE,
          allowedMimeTypes: ALLOWED_MIME_TYPES,
        });
      }
    } catch (bucketCheckErr) {
      console.warn('Bucket check/creation notice:', bucketCheckErr);
    }

    // 5. Generate unique filename and path
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const storagePath = `${folder}/${timestamp}_${sanitizedName}`;

    // Convert file to ArrayBuffer
    const fileArrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(fileArrayBuffer);

    // 6. Upload file buffer to Supabase Storage
    const { data: uploadData, error: uploadError } = await adminSupabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError);
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // 7. Get Public URL
    const { data: publicUrlData } = adminSupabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl;

    // 8. Optionally link to financial_documents if entity info provided
    if (entityType && entityId) {
      try {
        await adminSupabase.from('financial_documents').insert({
          company_id: 'a0000000-0000-0000-0000-000000000001',
          entity_type: entityType,
          entity_id: entityId,
          file_name: file.name,
          file_path: storagePath,
          file_size: file.size,
          mime_type: file.type || 'application/octet-stream',
          uploaded_by: '00000000-0000-0000-0000-000000000000', // placeholder or active user
        });
      } catch (docErr) {
        console.warn('Notice inserting into financial_documents:', docErr);
      }
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      storagePath,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
    });
  } catch (error: any) {
    console.error('Unhandled upload error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to process receipt upload.' },
      { status: 500 }
    );
  }
}
