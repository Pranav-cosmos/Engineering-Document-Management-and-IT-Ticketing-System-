import { supabase } from "../lib/supabase";

export async function logAudit(
    userId,
    action,
    entityType,
    entityId,
    details = ""
) {
    try {
        const payload = {
            action,
            entity_type: entityType,
            details,
        };

        // Only include user_id if provided
        if (userId) {
            payload.user_id = userId;
        }

        // Only include entity_id if it looks like a valid UUID
        if (entityId && typeof entityId === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entityId)) {
            payload.entity_id = entityId;
        }

        const { error } = await supabase
            .from("audit_logs")
            .insert([payload]);

        if (error) {
            console.error("Audit log insert failed:", error.message);
            // Try again without entity_id in case it's the problem
            if (payload.entity_id) {
                delete payload.entity_id;
                const { error: retryError } = await supabase
                    .from("audit_logs")
                    .insert([payload]);
                if (retryError) {
                    console.error("Audit log retry also failed:", retryError.message);
                }
            }
        }
    } catch (err) {
        // Never crash the main flow
        console.error("Audit log exception:", err);
    }
}

export async function clearAuditForEntity(entityId) {
    if (!entityId) return;

    try {
        const { error } = await supabase
            .from("audit_logs")
            .delete()
            .eq("entity_id", entityId);

        if (error) {
            console.error("Audit cleanup failed:", error.message);
        }
    } catch (err) {
        console.error("Audit cleanup exception:", err);
    }
}
