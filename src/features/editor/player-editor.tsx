import { z } from "zod";
import { Input } from "@/components/cupertino/input";
import {
  Item,
  ItemGroup,
  ItemContent,
  ItemTitle,
  ItemActions,
} from "@/components/ui/item";
import { useUpdatePlayerData } from "@/hooks/use-mutations";
import { useAppForm } from "@/lib/form";
import type { BankData, EconomyData, PlayerData } from "@/features/editor/types";
import type { SavePath } from "@/lib/core-types";
import { calculateLevel } from "@/lib/level-calc";

const PlayerFormSchema = z.object({
  money: z.number().int().min(0),
  experience: z.number().int().min(0),
});

interface PlayerEditorProps {
  savePath: SavePath;
  bank: BankData;
  player: PlayerData;
  economy: EconomyData;
  game: "ats" | "ets2";
}

export function PlayerEditor({ savePath, bank, player, economy, game }: PlayerEditorProps) {
  const mutation = useUpdatePlayerData(savePath);

  const form = useAppForm({
    defaultValues: {
      money: bank.money_account,
      experience: economy.experience_points ?? 0,
    },
    validators: { onSubmit: PlayerFormSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({
        money: value.money,
        experience: value.experience,
      });
    },
  });

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="space-y-4"
      >
        <ItemGroup>
          <form.AppField name="money">
            {(field) => (
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>Money</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Input
                      type="number"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(Number(e.target.value))}
                      onBlur={field.handleBlur}
                      className="w-36 text-right"
                      min={0}
                    />
                  </div>
                </ItemActions>
              </Item>
            )}
          </form.AppField>

          <form.AppField name="experience">
            {(field) => {
              const levelInfo = calculateLevel(field.state.value, game);
              return (
                <Item variant="outline">
                  <ItemContent>
                    <ItemTitle>Experience</ItemTitle>
                    <p className="text-xs text-muted-foreground">
                      Level {levelInfo.level} &middot;{" "}
                      {Math.round(levelInfo.progress * 100)}% to next
                    </p>
                  </ItemContent>
                  <ItemActions>
                    <Input
                      type="number"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(Number(e.target.value))}
                      onBlur={field.handleBlur}
                      className="w-36 text-right"
                      min={0}
                    />
                  </ItemActions>
                </Item>
              );
            }}
          </form.AppField>

          <Item variant="outline">
            <ItemContent>
              <ItemTitle>HQ City</ItemTitle>
            </ItemContent>
            <ItemActions>
              <span className="text-sm font-medium capitalize">
                {player.hq_city?.replace(/_/g, " ") ?? "—"}
              </span>
            </ItemActions>
          </Item>

          <Item variant="outline">
            <ItemContent>
              <ItemTitle>Driving Time</ItemTitle>
            </ItemContent>
            <ItemActions>
              <span className="text-sm font-medium">
                {player.driving_time != null
                  ? `${Math.floor(player.driving_time / 60)}h ${player.driving_time % 60}m`
                  : "—"}
              </span>
            </ItemActions>
          </Item>

          <Item variant="outline">
            <ItemContent>
              <ItemTitle>Loan Limit</ItemTitle>
            </ItemContent>
            <ItemActions>
              <span className="text-sm font-medium">
                ${bank.loan_limit?.toLocaleString() ?? "—"}
              </span>
            </ItemActions>
          </Item>

          <Item variant="outline">
            <ItemContent>
              <ItemTitle>Overdraft</ItemTitle>
            </ItemContent>
            <ItemActions>
              <span className="text-sm font-medium">
                {bank.overdraft ? "Active" : "None"}
              </span>
            </ItemActions>
          </Item>
        </ItemGroup>

        <div className="flex justify-end">
          <form.AppForm>
            <form.SubmitButton label="Save Changes" />
          </form.AppForm>
        </div>
      </form>
    </div>
  );
}
