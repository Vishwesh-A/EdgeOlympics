import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Medal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsOrganizer, useSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function Header() {
  const { user, ready } = useSession();
  const { data: isOrg } = useIsOrganizer(user?.id);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  const linkCls = "rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground";
  const active = { className: "rounded-full px-3 py-1.5 text-sm bg-secondary text-foreground" };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Medal className="h-4 w-4" />
          </span>
          <span className="text-lg">Edge Olympics</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link to="/" className={linkCls} activeProps={active} activeOptions={{ exact: true }}>
            Leaderboard
          </Link>
          {user && (
            <Link to="/team" className={linkCls} activeProps={active}>
              My team
            </Link>
          )}
          {isOrg && (
            <Link to="/organizer" className={linkCls} activeProps={active}>
              Organizer
            </Link>
          )}
          {ready &&
            (user ? (
              <Button variant="ghost" size="sm" onClick={signOut}>
                Sign out
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            ))}
        </nav>
      </div>
    </header>
  );
}
