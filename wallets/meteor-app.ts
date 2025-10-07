import type { Account, FinalExecutionOutcome, SignedMessage } from "@near-wallet-selector/core";

enum EMethod {
  sign_in = "sign_in",
  sign_out = "sign_out",
  sign_and_send_transaction = "sign_and_send_transaction",
  sign_and_send_transactions = "sign_and_send_transactions",
  sign_transaction = "sign_transaction",
  sign_delegate_action = "sign_delegate_action",
  create_signed_transaction = "create_signed_transaction",
  get_public_key = "get_public_key",
  sign_message = "sign_message",
  ping = "ping",
}

type Result =
  | FinalExecutionOutcome
  | Array<FinalExecutionOutcome>
  | Array<Account>
  | [Uint8Array, Uint8Array]
  | Uint8Array
  | SignedMessage;

interface IMeteorWalletAppAction {
  method: EMethod;
  args: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
  nonce: string;
}

const tryPostOrFail = <R extends Result>(
  action: Omit<IMeteorWalletAppAction, "nonce">,
  timeoutInMs?: number
): Promise<R> => {
  window.alert("Preparing nonce now");
  const nonce = Buffer.from(window.crypto.getRandomValues(new Uint8Array(10))).toString("base64");

  window.alert("Posting message now");

  postMessage(
    JSON.stringify(
      {
        ...action,
        nonce,
        source: "meteor-wallet-app-selector",
        href: window.location.href,
      },
      (_, v) => {
        if (typeof v === "bigint") {
          v.toString();
        }

        return v;
      }
    )
  );

  window.alert("Finish positing message");

  return new Promise<R>((resolve, reject) => {
    const abortController = new AbortController();
    let resolved = false;

    if (timeoutInMs) {
      setTimeout(() => {
        if (!resolved) {
          abortController.abort();
          reject(new Error(`Timeout of ${timeoutInMs}ms`));
        }
      }, timeoutInMs);
    }

    window.addEventListener(
      "message",
      (ev) => {
        if (typeof ev.data === "object" && ev.data?.response && ev.data?.nonce === nonce) {
          resolved = true;
          if (ev.data.isError) {
            reject(new Error(ev.data.response));
          } else {
            resolve(ev.data.response);
          }
          abortController.abort();
        }
      },
      {
        signal: abortController.signal,
      }
    );
  });
};

const postMessage = function (data: string) {
  // why this?
  // https://github.com/react-native-webview/react-native-webview/issues/323#issuecomment-511824940
  // @ts-ignore
  if (window?.ReactNativeWebView?.postMessage) {
    window.alert("Found RN Web View");
    // @ts-ignore
    return window?.ReactNativeWebView?.postMessage(data);
  } else {
    if (window.top) {
      if (window !== window.top) {
        // in an iframe
        if (window.top.location) {
          return window.top.postMessage(data, "*");
        }
      }
    }
  }

  throw new Error("Not supported");
};

class MeteorWalletApp {
  signedInAccounts: Array<Account> = [];

  async getAccounts() {
    return this.signedInAccounts;
  }

  async signIn(params: any) {
    await window.selector.ui.whenApprove({ title: "sign-in-a", button: "sign-in-a" });
    await tryPostOrFail(
      {
        method: EMethod.ping,
        args: {},
      },
      // we inject this window variable in app
      // and give a bit more time for respond
      // @ts-ignore
      window.__is_running_in_meteor_wallet_app__ ? 3000 : 1000
    );
    const data = await tryPostOrFail<Array<Account>>({
      method: EMethod.sign_in,
      args: params,
    });

    this.signedInAccounts = data;

    return data;
  }

  async signOut() {
    await window.selector.ui.whenApprove({ title: "sign-out", button: "sign-out" });
    if (this.signedInAccounts.length > 0) {
      await tryPostOrFail<Array<Account>>({
        method: EMethod.sign_out,
        args: {},
      });

      this.signedInAccounts = [];
    }
  }

  async signMessage(params: any) {
    await window.selector.ui.whenApprove({ title: "sign-message", button: "sign-message" });
    const data = await tryPostOrFail<SignedMessage>({
      method: EMethod.sign_message,
      args: {
        ...params,
        nonce: [...params.nonce],
      },
    });
    return data;
  }

  async signAndSendTransaction(params: any) {
    await window.selector.ui.whenApprove({ title: "signAndSendTransaction", button: "signAndSendTransaction" });
    const receiverId = params.receiverId;
    if (!receiverId) {
      throw new Error("No receiver found to send the transaction to");
    }

    const data = await tryPostOrFail<FinalExecutionOutcome>({
      method: EMethod.sign_and_send_transaction,
      args: {
        ...params,
        receiverId,
      },
    });
    return data;
  }

  async signAndSendTransactions(params: any) {
    await window.selector.ui.whenApprove({ title: "signAndSendTransactions", button: "signAndSendTransactions" });
    const data = await tryPostOrFail<Array<FinalExecutionOutcome>>({
      method: EMethod.sign_and_send_transactions,
      args: {
        ...params,
      },
    });
    return data;
  }
}

window.selector.ready(new MeteorWalletApp());
