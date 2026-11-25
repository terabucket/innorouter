import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFetcher } from "react-router";
import { LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";

type ActionResult = { ok: boolean; error: string | null };

/** Dialog with a form posted to the current route's action (intent=save). Closes and toasts on success. */
export function FormDialog({ trigger, title, description, id, children, success, submitLabel = "Save" }: {
  trigger: ReactNode;
  title: string;
  description?: string;
  id?: number;
  children: ReactNode;
  success: string;
  submitLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {/* Mounted only while open, so each opening starts with a fresh form and no stale error. */}
        <DialogForm id={id} title={title} description={description} success={success} submitLabel={submitLabel}
          onDone={() => setOpen(false)}>
          {children}
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

function DialogForm({ id, title, description, success, submitLabel, onDone, children }: {
  id?: number; title: string; description?: string; success: string; submitLabel: string;
  onDone: () => void; children: ReactNode;
}) {
  const fetcher = useFetcher<ActionResult>();
  const busy = fetcher.state !== "idle";
  const handled = useRef<ActionResult | undefined>(undefined);
  useEffect(() => {
    // Fire once per response, even if the parent re-renders while the dialog animates closed.
    if (fetcher.state === "idle" && fetcher.data?.ok && handled.current !== fetcher.data) {
      handled.current = fetcher.data;
      toast.success(success);
      onDone();
    }
  }, [fetcher.state, fetcher.data, success, onDone]);

  return (
    <fetcher.Form method="post" className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <input type="hidden" name="intent" value="save" />
      {id != null && <input type="hidden" name="id" value={id} />}
      {children}
      {fetcher.data?.error && <p role="alert" className="text-sm text-destructive">{fetcher.data.error}</p>}
      <DialogFooter>
        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
        <Button type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{submitLabel}</Button>
      </DialogFooter>
    </fetcher.Form>
  );
}

export function DeleteButton({ id, what, name }: { id: number; what: string; name: string }) {
  const fetcher = useFetcher<ActionResult>();
  const handled = useRef<ActionResult | undefined>(undefined);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || handled.current === fetcher.data) return;
    handled.current = fetcher.data;
    if (fetcher.data.ok) toast.success(`${what} "${name}" deleted`);
    else if (fetcher.data.error) toast.error(fetcher.data.error);
  }, [fetcher.state, fetcher.data, what, name]);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${name}`} disabled={fetcher.state !== "idle"}>
          <Trash2 className="text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {what.toLowerCase()} "{name}"?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => fetcher.submit({ intent: "delete", id: String(id) }, { method: "post" })}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Field({ label, htmlFor, hint, children }: {
  label: string; htmlFor: string; hint?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Read a FormData value as a trimmed string. */
export const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
