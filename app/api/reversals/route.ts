import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { reversalSchema } from '@/lib/validation/payment-schema';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = reversalSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.format() },
        { status: 422 }
      );
    }

    const { transactionId, reason } = validation.data;
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    // 1. Fetch original transaction
    const { data: original, error: fetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (fetchError || !original) {
      return NextResponse.json({ error: 'Original transaction not found.' }, { status: 404 });
    }

    if (original.status === 'reversed') {
      return NextResponse.json(
        { error: 'Transaction has already been reversed. Double reversals are strictly prohibited.' },
        { status: 400 }
      );
    }

    // 2. Check if another reversal already references this transaction
    const { data: existingReversal } = await supabase
      .from('transactions')
      .select('id')
      .eq('reversal_of_id', original.id)
      .maybeSingle();

    if (existingReversal) {
      return NextResponse.json(
        { error: 'An active contra-reversal already exists for this transaction ID.' },
        { status: 400 }
      );
    }

    const reversalRef = `REV-${Date.now()}`;

    // 3. Insert contra-reversal transaction
    const { data: revTxn, error: revError } = await supabase
      .from('transactions')
      .insert({
        company_id: original.company_id,
        reference_no: reversalRef,
        type: 'reversal',
        amount: original.amount,
        currency: original.currency,
        transaction_date: new Date().toISOString().split('T')[0],
        description: `Contra-reversal for ${original.referenceNo}: ${reason}`,
        status: 'posted',
        created_by: user.id,
        posted_by: user.id,
        posted_at: new Date().toISOString(),
        reversal_of_id: original.id,
        reversal_reason: reason,
      })
      .select()
      .single();

    if (revError) {
      return NextResponse.json({ error: revError.message }, { status: 400 });
    }

    // 4. Update original transaction status to reversed
    await supabase.from('transactions').update({ status: 'reversed' }).eq('id', original.id);

    // 5. Append immutable audit trail log
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'REVERSE_TRANSACTION',
      entity_type: 'Transaction',
      entity_id: original.id,
      reason,
      before_values: { status: original.status, referenceNo: original.referenceNo },
      after_values: { status: 'reversed', reversalRef },
    });

    return NextResponse.json({ success: true, reversalTransaction: revTxn });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
