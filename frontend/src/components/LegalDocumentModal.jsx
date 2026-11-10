import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./LegalDocumentModal.css";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function TermsDocument() {
  return (
    <>
      <div className="legal-document-modal__lead">
        <p>主体：符号刘文化传媒工作室（个体工商户）</p>
        <p>
          生效说明：您注册账号、登录网站、购买付费服务前，请仔细阅读本协议及配套《隐私政策》。
          <strong>
            退款规则、账号限制、版权约定、免责条款等重点内容已加粗提示，请重点阅读。您主动勾选
            “我已阅读并同意本用户协议及隐私政策”，即表示自愿接受全部条款约束；若不同意，请勿注册、登录及购买本网站任何服务。
          </strong>
        </p>
      </div>

      <section>
        <h3>1. 网站与服务提供者</h3>
        <p>
          【符号刘的德语资料库】，网站域名：<code>www.frauliu.com</code>、
          <code>frauliu.cn</code>，为符号刘文化传媒工作室（个体工商户，以下简称“平台 / 我方”）运营，
          向用户提供德语备考数字学习内容、在线题库、配套练习等学习辅助服务。
        </p>
        <p>
          客服联系渠道：<br />
          客服邮箱：<a href="mailto:contact@frauliu.com">contact@frauliu.com</a><br />
          客服微信：xqsr_co
        </p>
        <p>
          本网站仅为独立运营的语言备考辅助平台，
          <strong>并非 TELC 或其他语言考试的主办方、官方授权机构</strong>。
          平台不提供官方考试报名通道，不对用户考试结果、考试分数、考试通过作出任何承诺，
          与 TELC 及其他考试官方机构不存在任何官方合作关系。
        </p>
      </section>

      <section>
        <h3>2. 服务内容与会员权益</h3>
        <p>
          平台当前上线 TELC B1、TELC B2 备考内容，其他级别内容将持续更新；
          <strong>尚未上线内容不属于已交付商品，不纳入用户已购权益范围，平台不承诺固定更新周期</strong>。
        </p>
        <p>平台权益分为三类：</p>
        <ol>
          <li><strong>备考季（订阅制）</strong>：按用户选购的订阅时长提供对应周期内的在线练习权益，订阅到期后权益自动失效；</li>
          <li><strong>科普季（共 50 期）、Vlog（共 80 期）（买断制）</strong>：属于一次性购买的独立数字内容，购买开通权限后，在平台正常存续前提下，用户可永久使用该部分内容；</li>
          <li><strong>免费试用</strong>：平台对各板块前 3 道题目开放免费试用权限。所有用户均可通过免费题目体验网站功能、内容风格。<strong>请您充分试用评估后，再决定是否购买付费权益</strong>。</li>
        </ol>
        <p>
          平台有权根据运营需要，提前在网站公告栏公示后，对内容排版、功能、栏目名称进行优化调整，
          调整不会无故缩减用户已经购买、已生效的付费权益。
        </p>
      </section>

      <section>
        <h3>3. 素材来源、听力制作与免责声明</h3>
        <p>平台内容分为<strong>平台原创编写内容</strong>与<strong>外网收集整理的公开学习素材</strong>：</p>
        <ol>
          <li>原创内容：由 Frau Dr. Liu 独立编写的题目、听力文稿、中文讲解、配套释义，该部分著作权归符号刘文化传媒工作室所有；</li>
          <li>外网素材：部分学习文本来源于互联网公开可检索的外语学习资料，平台仅做整理、排版用于语言学习参考；平台已尽力溯源版权，如权利人发现素材未经授权使用，可通过客服渠道发送权属证明，平台收到合规通知后将及时下架对应内容。</li>
        </ol>
        <p>
          听力音频制作两种方式：<br />
          ① 基于合规获取的公开音频素材，配套重制练习题；<br />
          ② 无原始音频的题目，由我方重新撰写听力文稿，独立生成全新音频供练习使用。
        </p>
        <p>
          ⚠️ 平台<strong>不承诺提供考场原题、官方真题</strong>，所有内容仅用于语言能力练习、备考参考。
          正式考试题目、考试规则、评分标准以对应考试官方发布为准。站中带有“真题”标注的练习，
          是指来源于网络流传题库的题目。只要题目题干、听力选项、作文话题等要素中
          <strong>有任何一项</strong>符合网络收集的考题特征，本站即会将其标注为“真题”。
        </p>
        <p>
          平台提供的中文释义、讲解仅为辅助理解使用，不保证零错误。用户学习时建议结合权威词典、
          官方教材交叉核对，平台不对释义偏差造成的学习影响承担责任；平台不承担因备考、考试产生的
          时间成本、差旅、报名费用等间接损失。
        </p>
      </section>

      <section>
        <h3>4. 账号注册、设备管理与账号安全</h3>
        <ol>
          <li>注册登录：本站采用手机号核验注册登录，用户应当使用本人有权使用、可以正常接收验证码的手机号注册。用户有义务保证注册信息真实，妥善保管账号密码、验证码，因用户保管不当、主动泄露账号信息造成的损失，由用户自行承担。</li>
          <li>设备限制：账号仅限注册本人个人学习使用。同一账号最多支持 3 台设备同时在线登录，达到上限时，新设备登录会触发限制，或较早登录设备被系统自动下线。用户可在账号设置内自助查看、下线已登录设备。</li>
          <li>禁止行为：严禁出租、出借、售卖账号，严禁大规模共享账号、批量分发账号。平台会通过登录地点、设备、访问频率识别异常共享行为。若平台核实存在账号出租、售卖、恶意共享、批量分发等违规行为，平台有权根据违规严重程度，采取弹窗警告、限制做题功能、暂停账号、终止账号服务等处置措施。</li>
        </ol>
        <ul>
          <li>订阅制【备考季】：违规封禁的，已消耗的订阅时长不予退回，剩余订阅权益不予退款；</li>
          <li>买断制【科普季、Vlog】：情节严重、多次违规的，平台可终止该部分内容访问权限，不予退款。</li>
        </ul>
      </section>

      <section>
        <h3>5. 虚拟商品购买、退款与活动规则</h3>
        <p>
          平台售卖的备考季、科普季、Vlog 均属于数字化虚拟学习产品，付款开通权限后即可立即获取内容，
          <strong>不适用《消费者权益保护法》七天无理由退货</strong>。
        </p>
        <ol>
          <li>
            退款规则：
            <ul>
              <li><strong>支持退款情形（平台原因）：平台系统故障、服务器异常，导致用户已购付费内容持续无法访问、重复扣款、错扣费用，用户可提供订单凭证联系客服，平台核实后办理退款；</strong></li>
              <li><strong>不予退款情形（用户个人原因）</strong>：购买后没时间学习、觉得内容不符合预期、买错套餐、自身备考计划变更等，不予退款。</li>
              <li><strong>未成年人充值提示：</strong>请监护人妥善管控支付账号，未成年人未经监护人同意进行大额付费购买的，监护人可提供证明联系平台，平台将依法处理。</li>
            </ul>
          </li>
          <li>邀请有礼活动：用户参与推荐返现、延长订阅、赠送内容等邀请活动，应当遵守当期活动页面写明的规则。禁止脚本批量注册、虚假下单、刷单套取奖励。平台有权核查奖励获取记录，违规骗取的时长、内容权益、优惠，平台可直接撤销、收回。</li>
        </ol>
        <blockquote>
          平台可根据运营情况调整、下线各类邀请活动，调整前将在网站公告公示，不单独通知每位用户。本协议不代表活动承诺。
        </blockquote>
      </section>

      <section>
        <h3>6. 知识产权与内容使用边界</h3>
        <p>
          平台的原创题目文本、听力文稿、中文讲解、音频、页面排版、题库系统程序、笔记功能架构，
          受著作权法保护，著作权归符号刘文化传媒工作室所有。
        </p>
        <p>用户仅可在自身有效权限内，在线使用网站功能，用于<strong>个人非商用学习</strong>，可以做题、查看释义、保存个人笔记。</p>
        <p>严格禁止：使用爬虫、脚本、自动化抓取工具批量抓取题库；录屏、截图批量导出付费内容；将平台付费题目、音频、讲解发布到小红书、B 站、网盘、社群等第三方平台，或者转卖、二次分发。</p>
        <p>一经发现侵权盗录、批量爬取、传播付费内容行为，平台有权直接封禁账号、收回全部权益，同时保留追究民事赔偿的权利。</p>
      </section>

      <section>
        <h3>7. 个人信息、协议变更与争议处理</h3>
        <ol>
          <li>个人信息：关于手机号、登录日志、学习记录等信息收集、使用、存储、注销规则，请阅读配套《隐私政策》，隐私政策为本协议不可分割的一部分。</li>
          <li>协议修改：平台可因法规更新、业务调整修改本用户协议，修改后的版本将在网站公示，公示 7 日后生效；如您公示后继续使用网站服务，视为接受新版协议；如不接受，您可以停止使用、申请账号注销。</li>
          <li>问题反馈：遇到服务异常、扣款问题、账号封禁异议、版权投诉，请优先通过客服微信或邮箱联系我方协商处理。</li>
          <li>争议管辖：因本协议产生纠纷，双方优先友好协商；协商不成，任何一方可向<strong>平台经营主体所在地人民法院</strong>提起诉讼。</li>
        </ol>
      </section>
    </>
  );
}

function PrivacyDocument() {
  return (
    <>
      <div className="legal-document-modal__lead">
        <p>更新日期：2026 年</p>
        <p>运营主体：符号刘文化传媒工作室（个体工商户）</p>
        <p>本政策向您说明我们收集哪些个人信息、如何使用、如何保护、您拥有哪些信息权利。</p>
      </div>

      <section>
        <h3>一、我们收集哪些信息</h3>
        <ol>
          <li>注册信息：手机号（用于核验身份、登录、找回账号）；</li>
          <li>设备与日志信息：设备型号、浏览器标识、登录 IP、登录时间（用于识别异常登录、防范账号共享盗号、保障账号安全）；</li>
          <li>学习数据：做题记录、笔记、收藏内容（仅和您账号绑定，用于保存学习进度，您可以自行删除笔记）；</li>
          <li>订单信息：支付订单号、购买套餐记录（对账、处理退款、发放活动奖励使用，我方不收集银行卡、支付密码）。</li>
        </ol>
      </section>

      <section>
        <h3>二、信息如何使用</h3>
        <p>仅用于：账号登录核验、维持学习服务、保存学习进度、处理订单与售后、风控识别账号违规、客服回复问题。</p>
        <p><strong>不会在未取得您单独同意的情况下，把您的手机号、学习记录出售、出租给第三方用于营销推广。</strong></p>
      </section>

      <section>
        <h3>三、信息存储与保存期限</h3>
        <ol>
          <li>账号存续期间：保存注册信息、学习记录、订单记录；</li>
          <li>账号注销后：我们将在合理周期内清除您的手机号、学习笔记等个人信息；仅保留法律法规要求留存的交易对账记录；</li>
          <li>数据存储：学习数据存储于合规国内云服务商。</li>
        </ol>
      </section>

      <section>
        <h3>四、信息共享</h3>
        <p>除非下面情形，我们不会向第三方共享你的个人信息：</p>
        <ol>
          <li>获得您明确单独授权；</li>
          <li>司法机关、行政机关依法出具文书要求提供；</li>
          <li>为完成支付对接，向支付服务商传递必要订单信息（支付服务商受自身隐私规则约束）。</li>
        </ol>
      </section>

      <section>
        <h3>五、您的权利</h3>
        <ol>
          <li>查询：联系客服，查询我们保存的和你账号相关信息；</li>
          <li>删除：可以自行删除笔记、做题记录；</li>
          <li>账号注销：您可以联系客服微信 / 邮箱提交注销申请，注销后我们将按规则清理您个人信息；注销后已购买的付费权益将同步失效，不予退款；</li>
          <li>撤回同意：您可以停止使用平台服务。</li>
        </ol>
      </section>

      <section>
        <h3>六、安全措施</h3>
        <p>我们采取账号验证码、登录风控、访问日志留存等方式保护数据，但互联网无法做到绝对安全，请您妥善保管账号。</p>
      </section>

      <section>
        <h3>七、未成年人隐私</h3>
        <p>我们不主动收集未成年人信息。若您是未满 18 周岁的用户，请在监护人同意下使用平台。监护人发现未成年人提交信息，可以联系我们申请注销、删除信息。</p>
      </section>

      <section>
        <h3>八、政策更新</h3>
        <p>
          隐私政策变更会在网站公告更新，继续使用服务即代表您接受更新后的隐私政策。如有隐私相关疑问，
          请联系客服：<a href="mailto:contact@frauliu.com">contact@frauliu.com</a>
        </p>
      </section>
    </>
  );
}

const DOCUMENTS = {
  terms: {
    title: "符号刘的德语资料库 用户服务协议",
    content: <TermsDocument />,
  },
  privacy: {
    title: "符号刘的德语资料库 隐私政策",
    content: <PrivacyDocument />,
  },
};

export default function LegalDocumentModal({ documentType, onClose }) {
  const legalDocument = DOCUMENTS[documentType];
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!legalDocument || typeof globalThis.document === "undefined") return undefined;

    const previouslyFocused = globalThis.document.activeElement;
    const dialog = dialogRef.current;

    function getFocusableElements() {
      if (!dialog) return [];
      return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true"
      );
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      const first = focusableElements[0];
      const last = focusableElements.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }

      const activeElement = globalThis.document.activeElement;
      if (event.shiftKey && (activeElement === first || !dialog?.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !dialog?.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    getFocusableElements()[0]?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [legalDocument, onClose]);

  if (!legalDocument || typeof globalThis.document === "undefined") return null;

  const titleId = `legal-document-${documentType}-title`;

  const modal = (
    <div className="legal-document-modal__overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="legal-document-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="legal-document-modal__header">
          <h2 id={titleId}>{legalDocument.title}</h2>
          <button
            type="button"
            className="legal-document-modal__close"
            aria-label={documentType === "terms" ? "关闭用户服务协议" : "关闭隐私政策"}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <article className="legal-document-modal__body">{legalDocument.content}</article>
      </div>
    </div>
  );

  return createPortal(modal, globalThis.document.body);
}
